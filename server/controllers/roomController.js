// controllers/roomController.js
const Room = require("../models/Room");

exports.createRoom = async (req, res) => {
  try {
    const room = new Room({ name: req.body.name, users: [req.user.id] });
    await room.save();
    res.json(room);
  } catch (err) {
    res.status(500).send("Server error");
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().populate("users", "username");
    res.json(rooms);
  } catch (err) {
    res.status(500).send("Server error");
  }
};
