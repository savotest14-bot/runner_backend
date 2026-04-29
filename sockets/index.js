const { Server } = require("socket.io");
const socketAuth = require("./socketAuth");
const chatHandler = require("./chat.socket");
const { setIO } = require("./socketInstance");
const User = require("../models/user");
const { addUser, removeUser } = require("./onlineUsers");
module.exports = (server) => {
  // const io = new Server(server, {
  //   cors: {
  //     origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
  //     credentials: true,
  //   },
  // });

  const io = new Server(server, {
    cors: {
      origin: "*"
    }
  });
  
  setIO(io);

  io.use(socketAuth);

  // io.on("connection", async (socket) => {
  //   const userId = socket.user._id;

  //   console.log("✅ Connected:", userId);

  //   socket.join(`user_${userId}`);

  //   // 🔥 ONLINE TRUE
  //   await User.findByIdAndUpdate(userId, { isOnline: true });

  //   io.emit("user_status", {
  //     userId,
  //     isOnline: true
  //   });

  //   chatHandler(io, socket);

  //   socket.on("disconnect", async () => {
  //     console.log("❌ Disconnected:", userId);

  //     await User.findByIdAndUpdate(userId, {
  //       isOnline: false,
  //       lastSeen: new Date()
  //     });

  //     io.emit("user_status", {
  //       userId,
  //       isOnline: false,
  //       lastSeen: new Date()
  //     });
  //   });
  // });

  io.on("connection", async (socket) => {
    const userId = socket.user._id.toString();

    console.log("✅ Connected:", userId);

    /* ===== ONLINE USER ===== */
    addUser(userId, socket.id);
    socket.join(`user_${userId}`);

    await User.findByIdAndUpdate(userId, { isOnline: true });

    io.emit("user_status", {
      userId,
      isOnline: true
    });

    /* ===== CHAT HANDLER ===== */
    chatHandler(io, socket);

    /* ===== DISCONNECT ===== */
    socket.on("disconnect", async () => {
      console.log("❌ Disconnected:", userId);

      removeUser(userId);

      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      });

      io.emit("user_status", {
        userId,
        isOnline: false,
        lastSeen: new Date()
      });
    });
  });
};