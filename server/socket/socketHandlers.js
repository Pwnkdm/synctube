// socket/socketHandlers.js - Updated with host control logic
const Message = require("../models/Message");
const Room = require("../models/Room");
const VideoSync = require("../models/VideoSync");

module.exports = (io, socket) => {
  // Join Room
  socket.on("join-room", async (roomId) => {
    try {
      socket.join(roomId);

      // Add user to room if not already there
      const room = await Room.findOne({ roomId });
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      if (!room.users.includes(socket.user.id)) {
        room.users.push(socket.user.id);
        await room.save();
      }

      // Get current video state
      const currentVideo = await VideoSync.findOne({ roomId }).sort({
        updatedAt: -1,
      });

      // Populate users with usernames and host info
      const populatedRoom = await Room.findOne({ roomId }).populate([
        { path: "users", select: "username" },
        { path: "host", select: "username" },
      ]);

      // Check if current user is host
      const isHost = populatedRoom.host._id.toString() === socket.user.id;

      // Emit room joined with current state
      socket.emit("room-joined", {
        roomId,
        isHost,
        hostInfo: {
          userId: populatedRoom.host._id,
          username: populatedRoom.host.username,
        },
        connectedUsers: populatedRoom.users.map((u) => ({
          userId: u._id,
          username: u.username,
          voiceConnected: false,
          isHost: u._id.toString() === populatedRoom.host._id.toString(),
        })),
        currentVideo: currentVideo
          ? {
              videoId: currentVideo.videoId,
              title: currentVideo.title || "",
              url: currentVideo.url || "",
            }
          : {
              videoId: null,
              title: "",
              url: "",
            },
        playState: currentVideo
          ? {
              isPlaying: currentVideo.isPlaying || false,
              currentTime: currentVideo.currentTime || 0,
            }
          : {
              isPlaying: false,
              currentTime: 0,
            },
        roomSettings: {
          allowGuestControl: room.settings.allowGuestControl || false,
        },
      });

      // Notify others that a new user joined
      socket.to(roomId).emit("user-joined", {
        userId: socket.user.id,
        username: socket.user.username,
        voiceConnected: false,
        isHost: isHost,
      });
    } catch (err) {
      console.error("joinRoom error:", err);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Video Actions (load, play, pause, seek) - NOW WITH HOST CONTROL
  socket.on("video-action", async (data) => {
    const { roomId, action, videoData, playState } = data;

    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.users.includes(socket.user.id)) {
        socket.emit("error", { message: "Not authorized for this room" });
        return;
      }

      // Check if user has video control permissions
      const isHost = room.host.toString() === socket.user.id;
      const canControl = isHost || room.settings.allowGuestControl;

      if (!canControl) {
        socket.emit("error", {
          message: "Only the host can control video playback",
          code: "HOST_CONTROL_REQUIRED",
        });
        return;
      }

      let videoSync = await VideoSync.findOne({ roomId });

      switch (action) {
        case "load-video":
          if (!videoSync) {
            videoSync = new VideoSync({
              roomId,
              videoId: videoData.videoId,
              title: videoData.title || "",
              url: videoData.url || "",
              isPlaying: false,
              currentTime: 0,
              lastUpdatedBy: socket.user.id,
            });
          } else {
            videoSync.videoId = videoData.videoId;
            videoSync.title = videoData.title || "";
            videoSync.url = videoData.url || "";
            videoSync.isPlaying = false;
            videoSync.currentTime = 0;
            videoSync.lastUpdatedBy = socket.user.id;
          }
          await videoSync.save();
          break;

        case "play":
        case "pause":
          if (videoSync) {
            videoSync.isPlaying = action === "play";
            videoSync.currentTime = playState.currentTime || 0;
            videoSync.lastUpdatedBy = socket.user.id;
            videoSync.lastActionAt = new Date();
            await videoSync.save();
          }
          break;

        case "seek":
          if (videoSync) {
            videoSync.currentTime = playState.currentTime || 0;
            videoSync.lastUpdatedBy = socket.user.id;
            videoSync.lastActionAt = new Date();
            await videoSync.save();
          }
          break;

        default:
          socket.emit("error", { message: "Invalid video action" });
          return;
      }

      // Broadcast video sync to all users in the room
      io.to(roomId).emit("video-sync", {
        action,
        videoData: videoSync
          ? {
              videoId: videoSync.videoId,
              title: videoSync.title,
              url: videoSync.url,
            }
          : null,
        playState: videoSync
          ? {
              isPlaying: videoSync.isPlaying,
              currentTime: videoSync.currentTime,
            }
          : { isPlaying: false, currentTime: 0 },
        syncedBy: socket.user.username,
        isHostAction: isHost,
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("Video action error:", err);
      socket.emit("error", { message: "Failed to sync video" });
    }
  });

  // Transfer Host (only current host can do this)
  socket.on("transfer-host", async ({ roomId, newHostId }) => {
    try {
      const room = await Room.findOne({ roomId }).populate("users", "username");
      if (
        !room ||
        !room.users.find((u) => u._id.toString() === socket.user.id)
      ) {
        socket.emit("error", { message: "Not authorized for this room" });
        return;
      }

      // Check if current user is host
      if (room.host.toString() !== socket.user.id) {
        socket.emit("error", {
          message: "Only the host can transfer host privileges",
        });
        return;
      }

      // Check if new host is in the room
      const newHost = room.users.find((u) => u._id.toString() === newHostId);
      if (!newHost) {
        socket.emit("error", { message: "User not found in room" });
        return;
      }

      // Update host
      room.host = newHostId;
      await room.save();

      // Send system message
      const systemMessage = new Message({
        room: roomId,
        sender: socket.user.id,
        content: `${socket.user.username} transferred host privileges to ${newHost.username}`,
        messageType: "system",
      });
      await systemMessage.save();

      // Notify all users
      io.to(roomId).emit("host-transferred", {
        oldHost: {
          userId: socket.user.id,
          username: socket.user.username,
        },
        newHost: {
          userId: newHostId,
          username: newHost.username,
        },
      });

      io.to(roomId).emit("new-message", {
        sender: "System",
        content: systemMessage.content,
        timestamp: systemMessage.createdAt,
        messageType: "system",
      });
    } catch (err) {
      console.error("Transfer host error:", err);
      socket.emit("error", { message: "Failed to transfer host" });
    }
  });

  // Toggle Guest Control (only host can do this)
  socket.on("toggle-guest-control", async ({ roomId, allowGuestControl }) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.users.includes(socket.user.id)) {
        socket.emit("error", { message: "Not authorized for this room" });
        return;
      }

      // Check if current user is host
      if (room.host.toString() !== socket.user.id) {
        socket.emit("error", {
          message: "Only the host can change room settings",
        });
        return;
      }

      // Update setting
      room.settings.allowGuestControl = allowGuestControl;
      await room.save();

      // Send system message
      const systemMessage = new Message({
        room: roomId,
        sender: socket.user.id,
        content: `${socket.user.username} ${
          allowGuestControl ? "enabled" : "disabled"
        } guest video control`,
        messageType: "system",
      });
      await systemMessage.save();

      // Notify all users
      io.to(roomId).emit("room-settings-updated", {
        allowGuestControl,
        updatedBy: socket.user.username,
      });

      io.to(roomId).emit("new-message", {
        sender: "System",
        content: systemMessage.content,
        timestamp: systemMessage.createdAt,
        messageType: "system",
      });
    } catch (err) {
      console.error("Toggle guest control error:", err);
      socket.emit("error", { message: "Failed to update room settings" });
    }
  });

  // Voice Chat Toggle
  socket.on("voice-toggle", async ({ roomId, isConnected }) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.users.includes(socket.user.id)) {
        socket.emit("error", { message: "Not authorized for this room" });
        return;
      }

      // Store voice status in socket for this room
      if (!socket.voiceRooms) {
        socket.voiceRooms = new Map();
      }
      socket.voiceRooms.set(roomId, isConnected);

      // Notify all users in the room about voice status change
      socket.to(roomId).emit("voice-status-update", {
        userId: socket.user.id,
        username: socket.user.username,
        voiceConnected: isConnected,
      });

      // Send system message about voice status
      const systemMessage = new Message({
        room: roomId,
        sender: socket.user.id,
        content: `${socket.user.username} ${
          isConnected ? "joined" : "left"
        } voice chat`,
        messageType: "system",
      });
      await systemMessage.save();

      io.to(roomId).emit("new-message", {
        sender: "System",
        content: systemMessage.content,
        timestamp: systemMessage.createdAt,
        messageType: "system",
      });
    } catch (err) {
      console.error("Voice toggle error:", err);
      socket.emit("error", { message: "Failed to toggle voice chat" });
    }
  });

  // WebRTC Signaling for Voice Chat
  socket.on("webrtc-offer", ({ roomId, targetUserId, offer }) => {
    socket.to(roomId).emit("webrtc-offer", {
      fromUserId: socket.user.id,
      fromUsername: socket.user.username,
      targetUserId,
      offer,
    });
  });

  socket.on("webrtc-answer", ({ roomId, targetUserId, answer }) => {
    socket.to(roomId).emit("webrtc-answer", {
      fromUserId: socket.user.id,
      fromUsername: socket.user.username,
      targetUserId,
      answer,
    });
  });

  socket.on("webrtc-ice-candidate", ({ roomId, targetUserId, candidate }) => {
    socket.to(roomId).emit("webrtc-ice-candidate", {
      fromUserId: socket.user.id,
      targetUserId,
      candidate,
    });
  });

  // Chat messages
  socket.on("send-message", async ({ roomId, message }) => {
    try {
      const room = await Room.findOne({ roomId }).populate("users", "username");
      if (
        !room ||
        !room.users.find((u) => u._id.toString() === socket.user.id)
      ) {
        socket.emit("error", {
          message: "Not authorized to send messages in this room",
        });
        return;
      }

      // Find the current user in the room
      const currentUser = room.users.find(
        (u) => u._id.toString() === socket.user.id
      );

      const newMessage = new Message({
        room: roomId,
        sender: socket.user.id,
        content: message,
        messageType: "user",
      });
      await newMessage.save();

      const sendMessage = {
        _id: newMessage._id,
        sender: currentUser.username,
        content: message,
        timestamp: newMessage.createdAt,
        messageType: "user",
      };

      io.to(roomId).emit("new-message", sendMessage);
    } catch (err) {
      console.error("Error saving message:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Get recent messages for a room
  socket.on("get-messages", async (roomId) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room || !room.users.includes(socket.user.id)) {
        socket.emit("error", { message: "Not authorized for this room" });
        return;
      }

      const messages = await Message.find({ room: roomId })
        .populate("sender", "username")
        .sort({ createdAt: -1 })
        .limit(50);

      const formattedMessages = messages.reverse().map((msg) => ({
        _id: msg._id,
        sender: msg.messageType === "system" ? "System" : msg.sender.username,
        content: msg.content,
        timestamp: msg.createdAt,
        messageType: msg.messageType || "user",
      }));

      socket.emit("messages-history", formattedMessages);
    } catch (err) {
      console.error("Error fetching messages:", err);
      socket.emit("error", { message: "Failed to fetch messages" });
    }
  });

  // Sync request - when user wants current video state
  socket.on("request-sync", async (roomId) => {
    try {
      const videoSync = await VideoSync.findOne({ roomId }).sort({
        updatedAt: -1,
      });

      if (videoSync) {
        socket.emit("video-sync", {
          action: "sync",
          videoData: {
            videoId: videoSync.videoId,
            title: videoSync.title,
            url: videoSync.url,
          },
          playState: {
            isPlaying: videoSync.isPlaying,
            currentTime: videoSync.currentTime,
          },
          timestamp: videoSync.lastActionAt || videoSync.updatedAt,
        });
      }
    } catch (err) {
      console.error("Sync request error:", err);
      socket.emit("error", { message: "Failed to sync" });
    }
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    try {
      // Find all rooms this user was in
      const rooms = await Room.find({ users: socket.user.id });

      for (const room of rooms) {
        // Check if user was in voice chat and notify others
        if (socket.voiceRooms && socket.voiceRooms.get(room.roomId)) {
          socket.to(room.roomId).emit("voice-status-update", {
            userId: socket.user.id,
            username: socket.user.username,
            voiceConnected: false,
          });

          // Send system message about user leaving voice
          const systemMessage = new Message({
            room: room.roomId,
            sender: socket.user.id,
            content: `${socket.user.username} left voice chat`,
            messageType: "system",
          });
          await systemMessage.save();

          socket.to(room.roomId).emit("new-message", {
            sender: "System",
            content: systemMessage.content,
            timestamp: systemMessage.createdAt,
            messageType: "system",
          });
        }

        // Remove user from the room
        room.users = room.users.filter(
          (u) => u.toString() !== socket.user.id.toString()
        );
        await room.save();

        // Notify others in the room that user left
        socket.to(room.roomId).emit("user-left", {
          userId: socket.user.id,
          username: socket.user.username,
        });
      }
    } catch (err) {
      console.error("Error on disconnect:", err);
    }
  });
};
