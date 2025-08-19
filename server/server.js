// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [process.env.CLIENT_URL, "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/YoutubeSync",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isOnline: { type: Boolean, default: false },
  currentRoom: { type: String, default: null },
  voiceConnected: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Room Schema
const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  host: { type: String, required: true },
  currentVideo: {
    videoId: { type: String, default: null },
    url: { type: String, default: null },
    title: { type: String, default: null },
  },
  playState: {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    lastUpdate: { type: Date, default: Date.now },
  },
  connectedUsers: [
    {
      userId: String,
      username: String,
      voiceConnected: Boolean,
      joinedAt: { type: Date, default: Date.now },
    },
  ],
  settings: {
    isPrivate: { type: Boolean, default: false },
    maxUsers: { type: Number, default: 50 },
  },
  createdAt: { type: Date, default: Date.now },
});

// Message Schema
const messageSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  messageType: { type: String, enum: ["chat", "system"], default: "chat" },
});

// Create Models
const User = mongoose.model("User", userSchema);
const Room = mongoose.model("Room", roomSchema);
const Message = mongoose.model("Message", messageSchema);

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key",
    (err, user) => {
      if (err) return res.status(403).json({ error: "Invalid token" });
      req.user = user;
      next();
    }
  );
};

// Socket.io Authentication Middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error"));
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    );
    const user = await User.findById(decoded.userId);

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
};

// REST API Routes

// User Authentication
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    // Update user online status
    user.isOnline = true;
    await user.save();

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Room Management
app.post("/api/rooms", authenticateToken, async (req, res) => {
  try {
    const { name, isPrivate = false, maxUsers = 50 } = req.body;
    const roomId = Math.random().toString(36).substring(2, 15);

    const room = new Room({
      roomId,
      name,
      host: req.user.username,
      settings: { isPrivate, maxUsers },
      connectedUsers: [
        {
          userId: req.user.userId,
          username: req.user.username,
          voiceConnected: false,
        },
      ],
    });

    await room.save();

    // Update user's current room
    await User.findByIdAndUpdate(req.user.userId, { currentRoom: roomId });

    res.status(201).json({
      roomId: room.roomId,
      name: room.name,
      host: room.host,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/rooms/:roomId", authenticateToken, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get room messages
app.get("/api/rooms/:roomId/messages", authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io Connection Handling
io.use(authenticateSocket);

// Store active socket connections
const activeConnections = new Map();

io.on("connection", (socket) => {
  console.log(`User ${socket.user.username} connected`);

  // Store connection
  activeConnections.set(socket.user._id.toString(), socket);

  // Handle room joining
  socket.on("join-room", async (roomId) => {
    try {
      let room = await Room.findOne({ roomId });

      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      // Check if user is already in room
      const userInRoom = room.connectedUsers.find(
        (user) => user.userId === socket.user._id.toString()
      );

      if (!userInRoom) {
        // Add user to room
        room.connectedUsers.push({
          userId: socket.user._id.toString(),
          username: socket.user.username,
          voiceConnected: false,
        });
        await room.save();
      }

      // Update user's current room
      await User.findByIdAndUpdate(socket.user._id, {
        currentRoom: roomId,
        isOnline: true,
      });

      // Join socket room
      socket.join(roomId);
      socket.currentRoom = roomId;

      // Send room data to user
      socket.emit("room-joined", {
        roomId: room.roomId,
        name: room.name,
        connectedUsers: room.connectedUsers,
        currentVideo: room.currentVideo,
        playState: room.playState,
      });

      // Notify others in room
      socket.to(roomId).emit("user-joined", {
        userId: socket.user._id.toString(),
        username: socket.user.username,
      });

      // Send system message
      const systemMessage = new Message({
        roomId,
        userId: "system",
        username: "System",
        message: `${socket.user.username} joined the room`,
        messageType: "system",
      });
      await systemMessage.save();

      io.to(roomId).emit("new-message", systemMessage);
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Handle video synchronization
  socket.on("video-action", async (data) => {
    try {
      const { roomId, action, videoData, playState } = data;

      const room = await Room.findOne({ roomId });
      if (!room) return;

      // Update room state
      if (videoData) {
        room.currentVideo = videoData;
      }

      if (playState) {
        room.playState = {
          ...playState,
          lastUpdate: new Date(),
        };
      }

      await room.save();

      // Broadcast to all users in room except sender
      socket.to(roomId).emit("video-sync", {
        action,
        videoData,
        playState,
        timestamp: new Date(),
        user: socket.user.username,
      });
    } catch (error) {
      console.error("Video sync error:", error);
    }
  });

  // Handle chat messages
  socket.on("send-message", async (data) => {
    try {
      const { roomId, message } = data;

      const newMessage = new Message({
        roomId,
        userId: socket.user._id.toString(),
        username: socket.user.username,
        message,
      });

      await newMessage.save();

      // Broadcast message to room
      io.to(roomId).emit("new-message", newMessage);
    } catch (error) {
      console.error("Message error:", error);
    }
  });

  // Handle voice connection
  socket.on("voice-toggle", async (data) => {
    try {
      const { roomId, isConnected } = data;

      const room = await Room.findOne({ roomId });
      if (!room) return;

      // Update user's voice status in room
      const userIndex = room.connectedUsers.findIndex(
        (user) => user.userId === socket.user._id.toString()
      );

      if (userIndex !== -1) {
        room.connectedUsers[userIndex].voiceConnected = isConnected;
        await room.save();
      }

      // Update user document
      await User.findByIdAndUpdate(socket.user._id, {
        voiceConnected: isConnected,
      });

      // Notify room about voice status change
      socket.to(roomId).emit("voice-status-update", {
        userId: socket.user._id.toString(),
        username: socket.user.username,
        voiceConnected: isConnected,
      });
    } catch (error) {
      console.error("Voice toggle error:", error);
    }
  });

  // Handle WebRTC signaling for voice chat
  socket.on("webrtc-offer", (data) => {
    socket.to(data.target).emit("webrtc-offer", {
      offer: data.offer,
      sender: socket.id,
    });
  });

  socket.on("webrtc-answer", (data) => {
    socket.to(data.target).emit("webrtc-answer", {
      answer: data.answer,
      sender: socket.id,
    });
  });

  socket.on("webrtc-ice-candidate", (data) => {
    socket.to(data.target).emit("webrtc-ice-candidate", {
      candidate: data.candidate,
      sender: socket.id,
    });
  });

  // Handle disconnection
  socket.on("disconnect", async () => {
    try {
      console.log(`User ${socket.user.username} disconnected`);

      // Remove from active connections
      activeConnections.delete(socket.user._id.toString());

      // Update user status
      await User.findByIdAndUpdate(socket.user._id, {
        isOnline: false,
        voiceConnected: false,
        currentRoom: null,
      });

      // If user was in a room, remove them and notify others
      if (socket.currentRoom) {
        const room = await Room.findOne({ roomId: socket.currentRoom });
        if (room) {
          room.connectedUsers = room.connectedUsers.filter(
            (user) => user.userId !== socket.user._id.toString()
          );
          await room.save();

          // Send system message
          const systemMessage = new Message({
            roomId: socket.currentRoom,
            userId: "system",
            username: "System",
            message: `${socket.user.username} left the room`,
            messageType: "system",
          });
          await systemMessage.save();

          socket.to(socket.currentRoom).emit("user-left", {
            userId: socket.user._id.toString(),
            username: socket.user.username,
          });

          socket.to(socket.currentRoom).emit("new-message", systemMessage);
        }
      }
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
