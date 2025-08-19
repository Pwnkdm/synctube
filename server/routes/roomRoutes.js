// routes/roomRoutes.js
const express = require("express");
const router = express.Router();
const { createRoom, getRooms } = require("../controllers/roomController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/", authMiddleware, createRoom);
router.get("/", authMiddleware, getRooms);

module.exports = router;
