// socket/socketHandlers.js
const Message = require("../models/Message");
const Room = require("../models/Room");

module.exports = (io, socket) => {
  // Join Room
  socket.on("join-room", async (roomId) => {
    try {
      socket.join(roomId);

      // add user to room if not already there
      const room = await Room.findOne({ roomId });
      if (!room) return;

      if (!room.users.includes(socket.user.id)) {
        room.users.push(socket.user.id);
        await room.save();
      }

      // populate users with usernames
      const populatedRoom = await Room.findOne({ roomId }).populate(
        "users",
        "username"
      );

      // emit full data including usernames
      io.to(roomId).emit("room-joined", {
        roomId,
        connectedUsers: populatedRoom.users.map((u) => ({
          id: u._id,
          username: u.username,
        })),
        currentVideo: {
          videoId: null,
          title: "",
        },
        playState: {
          isPlaying: false,
          currentTime: 0,
        },
      });
    } catch (err) {
      console.error("joinRoom error:", err);
    }
  });

  // Chat messages
  socket.on("send-message", async ({ roomId, message }) => {
    try {
      const room = await Room.findOne({ roomId }).populate("users", "username");

      // Find the current user in the room
      const { username } = room?.users.find(
        (u) => u._id.toString() === socket.user.id
      );

      const newMessage = new Message({
        room: roomId,
        sender: socket.user.id,
        content: message,
      });

      await newMessage.save();

      const sendMessage = {
        sender: username,
        content: message,
        timestamp: newMessage.createdAt,
      };

      io.to(roomId).emit("new-message", sendMessage);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    try {
      // find all rooms this user was in
      const rooms = await Room.find({ users: socket.user.id });

      for (const room of rooms) {
        // remove user from the room
        room.users = room.users.filter(
          (u) => u.toString() !== socket.user.id.toString()
        );
        await room.save();

        // notify others in the room
        io.to(room.roomId).emit("user-left", { id: socket.user.id });
      }
    } catch (err) {
      console.error("Error on disconnect:", err);
    }
  });
};
