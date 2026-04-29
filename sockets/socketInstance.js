// sockets/socketInstance.js

let io = null;

const setIO = (ioInstance) => {
  io = ioInstance;
};

const getIO = () => {
  if (!io) throw new Error("Socket not initialized");
  return io;
};

module.exports = { setIO, getIO };