// routes/rooms.js - Updated to set creator as host
const express = require("express");
const Room = require("../models/Room");
const auth = require("../middleware/authMiddleware");
const { nanoid } = require("nanoid");

const router = express.Router();

// Create a new room
router.post("/", auth, async (req, res) => {
  try {
    const { name, isPrivate = false, allowGuestControl = false } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "Room name is required" });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: "Room name too long" });
    }

    const roomId = nanoid(4);

    const room = new Room({
      roomId,
      name: name.trim(),
      isPrivate,
      host: req.user.id, // Set creator as host
      users: [req.user.id],
      createdBy: req.user.id,
      settings: {
        allowGuestControl,
        maxUsers: 50,
      },
    });

    await room.save();

    // Populate the host and users for response
    await room.populate([
      { path: "host", select: "username" },
      { path: "users", select: "username" },
      { path: "createdBy", select: "username" },
    ]);

    res.status(201).json({
      message: "Room created successfully",
      room: {
        roomId: room.roomId,
        name: room.name,
        isPrivate: room.isPrivate,
        host: room.host,
        users: room.users,
        createdBy: room.createdBy,
        settings: room.settings,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    console.error("Room creation error:", error);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// Get room details
router.get("/:roomId", auth, async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId }).populate([
      { path: "host", select: "username" },
      { path: "users", select: "username" },
      { path: "createdBy", select: "username" },
    ]);

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is in room or if room is public
    const isUserInRoom = room.users.some(
      (user) => user._id.toString() === req.user.id
    );
    const isHost = room.host._id.toString() === req.user.id;

    if (room.isPrivate && !isUserInRoom) {
      return res.status(403).json({ error: "Access denied to private room" });
    }

    res.json({
      room: {
        roomId: room.roomId,
        name: room.name,
        isPrivate: room.isPrivate,
        host: room.host,
        users: room.users,
        createdBy: room.createdBy,
        settings: room.settings,
        isHost,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get room error:", error);
    res.status(500).json({ error: "Failed to get room details" });
  }
});

// Update room settings (only host can do this)
router.patch("/:roomId/settings", auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { allowGuestControl, maxUsers, name } = req.body;

    const room = await Room.findOne({ roomId });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is host
    if (room.host.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the host can update room settings" });
    }

    // Update settings
    if (typeof allowGuestControl === "boolean") {
      room.settings.allowGuestControl = allowGuestControl;
    }
    if (typeof maxUsers === "number" && maxUsers > 0 && maxUsers <= 100) {
      room.settings.maxUsers = maxUsers;
    }
    if (name && name.trim().length > 0 && name.length <= 100) {
      room.name = name.trim();
    }

    await room.save();

    await room.populate([
      { path: "host", select: "username" },
      { path: "users", select: "username" },
    ]);

    res.json({
      message: "Room settings updated successfully",
      room: {
        roomId: room.roomId,
        name: room.name,
        isPrivate: room.isPrivate,
        host: room.host,
        settings: room.settings,
        updatedAt: room.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update room settings error:", error);
    res.status(500).json({ error: "Failed to update room settings" });
  }
});

// Get user's rooms
router.get("/user/rooms", auth, async (req, res) => {
  try {
    const rooms = await Room.find({
      users: req.user.id,
    })
      .populate([
        { path: "host", select: "username" },
        { path: "createdBy", select: "username" },
      ])
      .sort({ updatedAt: -1 });

    const roomsWithUserInfo = rooms.map((room) => ({
      roomId: room.roomId,
      name: room.name,
      isPrivate: room.isPrivate,
      host: room.host,
      createdBy: room.createdBy,
      userCount: room.users.length,
      isHost: room.host._id.toString() === req.user.id,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    }));

    res.json({ rooms: roomsWithUserInfo });
  } catch (error) {
    console.error("Get user rooms error:", error);
    res.status(500).json({ error: "Failed to get user rooms" });
  }
});

// Delete room (only host can do this)
router.delete("/:roomId", auth, async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check if user is host
    if (room.host.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Only the host can delete the room" });
    }

    await Room.deleteOne({ roomId });

    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Delete room error:", error);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

module.exports = router;
