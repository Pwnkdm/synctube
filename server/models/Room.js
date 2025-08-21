// models/Room.js - Updated to include host field
const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    settings: {
      allowGuestControl: {
        type: Boolean,
        default: false,
      },
      maxUsers: {
        type: Number,
        default: 50,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
roomSchema.index({ roomId: 1 });
roomSchema.index({ host: 1 });
roomSchema.index({ users: 1 });

module.exports = mongoose.model("Room", roomSchema);
