// websocket utils code
class WebSocketManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  broadcastToRoom(roomId, event, data, excludeSocketId = null) {
    if (excludeSocketId) {
      this.io.to(roomId).except(excludeSocketId).emit(event, data);
    } else {
      this.io.to(roomId).emit(event, data);
    }
  }

  async getRoomUsers(roomId) {
    const sockets = await this.io.in(roomId).fetchSockets();
    return sockets.map((socket) => ({
      id: socket.user._id.toString(),
      username: socket.user.username,
      socketId: socket.id,
    }));
  }

  sendToUser(userId, event, data) {
    this.io.to(userId).emit(event, data);
  }
}

module.exports = WebSocketManager;
