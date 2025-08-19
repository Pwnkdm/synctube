// socket/socketHandlers.js
const Message = require("../models/Message");

module.exports = (io, socket) => {
  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
  });

  socket.on("chatMessage", async ({ roomId, message }) => {
    const newMessage = new Message({
      room: roomId,
      sender: socket.user.id,
      content: message,
    });
    await newMessage.save();
    io.to(roomId).emit("message", { sender: socket.user.id, content: message });
  });
};
