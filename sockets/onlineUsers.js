// sockets/onlineUsers.js

const onlineUsers = new Map();

const addUser = (userId, socketId) => {
  onlineUsers.set(userId.toString(), socketId);
};

const removeUser = (userId) => {
  onlineUsers.delete(userId.toString());
};

const getAllUsers = () => {
  return Array.from(onlineUsers.keys());
};

const isUserOnline = (userId) => {
  return onlineUsers.has(userId.toString());
};

module.exports = {
  addUser,
  removeUser,
  getAllUsers,
  isUserOnline
};