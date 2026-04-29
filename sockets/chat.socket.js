const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Ticket = require("../models/Ticket");

module.exports = (io, socket) => {

  /* ================= JOIN CHAT ================= */
  socket.on("join_chat", async ({ chatId }) => {
    try {
      if (!chatId) return socket.emit("error", "chatId required");

      const chat = await Chat.findById(chatId);
      if (!chat) return socket.emit("error", "Chat not found");

      const userId = socket.user._id.toString();

      /* ===== VALIDATION ===== */
      if (chat.type === "direct") {
        const ok = chat.participants.some(p => p.toString() === userId);
        if (!ok) return socket.emit("error", "Not allowed");
      }

      if (chat.type === "group") {
        const ok = socket.user.groupRoles.some(
          g => g.groupId.toString() === chat.group.toString()
        );
        if (!ok) return socket.emit("error", "Not in group");
      }

      if (chat.type === "ticket") {
        const ticket = await Ticket.findById(chat.ticket);

        const allowed =
          ticket &&
          ticket.chatEnabled &&
          ticket.status !== "closed" &&
          (
            ticket.createdBy.toString() === userId ||
            ticket.assignedTo.toString() === userId
          );

        if (!allowed) return socket.emit("error", "Not allowed");
      }

      /* ===== JOIN ROOM ===== */
      socket.join(`chat_${chatId}`);

      /* ===== MARK DELIVERED ===== */
      await Message.updateMany(
        {
          chat: chatId,
          sender: { $ne: userId },
          deliveredTo: { $ne: userId }
        },
        {
          $addToSet: { deliveredTo: userId }
        }
      );

      socket.to(`chat_${chatId}`).emit("message_delivered", {
        chatId,
        userId
      });

      socket.emit("joined_chat", { chatId });

    } catch (err) {
      socket.emit("error", err.message);
    }
  });

  /* ================= TYPING ================= */
  socket.on("typing", ({ chatId }) => {
    if (!chatId) return;

    socket.to(`chat_${chatId}`).emit("typing", {
      chatId,
      userId: socket.user._id
    });

    // 🔥 auto stop fallback
    setTimeout(() => {
      socket.to(`chat_${chatId}`).emit("stop_typing", {
        chatId,
        userId: socket.user._id
      });
    }, 2000);
  });

  socket.on("stop_typing", ({ chatId }) => {
    if (!chatId) return;

    socket.to(`chat_${chatId}`).emit("stop_typing", {
      chatId,
      userId: socket.user._id
    });
  });

  /* ================= SEEN ================= */
  socket.on("mark_seen", async ({ chatId }) => {
    try {
      if (!chatId) return;

      const userId = socket.user._id.toString();

      /* ================= MARK MESSAGES AS SEEN ================= */

      await Message.updateMany(
        {
          chat: chatId,
          sender: { $ne: userId },
          seenBy: { $ne: userId }
        },
        {
          $addToSet: { seenBy: userId }
        }
      );

      /* ================= RESET UNREAD COUNT ================= */

      const chat = await Chat.findById(chatId);

      if (chat?.unreadCount?.get(userId) > 0) {
        chat.unreadCount.set(userId, 0);
        await chat.save();

        // 🔔 update only this user
        io.to(`user_${userId}`).emit("unread_update", {
          chatId,
          unreadCount: 0
        });
      }

      /* ================= NOTIFY OTHER USERS ================= */

      socket.to(`chat_${chatId}`).emit("message_seen", {
        chatId,
        userId
      });

    } catch (err) {
      socket.emit("error", err.message);
    }
  });

};