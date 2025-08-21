// controllers/roomController.js
const Room = require("../models/Room");
const { nanoid } = require("nanoid");

exports.createRoom = async (req, res) => {
  try {
    const room = new Room({
      name: req.body.name,
      users: [req.user.id],
      roomId: nanoid(4),
    });

    await room.save();
    res.status(201).json({ success: true, room: room.toObject() });
  } catch (err) {
    console.error("Room create error:", err);
    res.status(500).json({ msg: err.message });
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().populate("users", "username");
    res.json(rooms.toObject());
  } catch (err) {
    res.status(500).send("Server error");
  }
};
