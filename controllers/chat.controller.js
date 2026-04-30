const Chat = require("../models/Chat");
const Group = require("../models/group");
const User = require("../models/user");
const Message = require("../models/Message");
const Ticket = require("../models/Ticket");
const mongoose = require("mongoose");
const { canDirectChat } = require("../utils/chatPermission");
const checkIsGroupAdmin = require("../utils/checkIsGroupAdmin");
const { getIO } = require("../sockets/socketInstance");
const { getAllUsers } = require("../sockets/onlineUsers");
// const admin = require("../config/firebase");


exports.initChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, receiverId, groupId } = req.body;

    let chat;

    /* ================= DIRECT CHAT ================= */
    if (type === "direct") {

      if (!receiverId) {
        return res.status(400).json({ message: "receiverId required" });
      }

      if (receiverId === userId.toString()) {
        return res.status(400).json({ message: "Cannot chat with yourself" });
      }

      // 🔥 get receiver
      const receiverRaw = await User.findById(receiverId).populate("role");

      if (!receiverRaw) {
        return res.status(404).json({ message: "Receiver not found" });
      }

      // 🔥 compute BOTH sender & receiver group admin
      const [receiverIsGA, senderIsGA] = await Promise.all([
        checkIsGroupAdmin(receiverId),
        checkIsGroupAdmin(userId)
      ]);

      const sender = {
        _id: userId,
        role: req.user.role, // already string
        isGroupAdmin: senderIsGA
      };
      const receiver = {
        _id: receiverRaw._id,
        role: receiverRaw.role.name,
        isGroupAdmin: receiverIsGA
      };

      // 🔐 hierarchy check
      if (!canDirectChat(sender, receiver)) {
        return res.status(403).json({
          message: "You are not allowed to start direct chat with this user"
        });
      }

      // ✅ check existing chat
      chat = await Chat.findOne({
        type: "direct",
        participants: { $all: [userId, receiverId] }
      });

      // ✅ create if not exists
      if (!chat) {
        chat = await Chat.create({
          type: "direct",
          participants: [userId, receiverId]
        });
      }
    }

    /* ================= GROUP CHAT ================= */
    else if (type === "group") {

      if (!groupId) {
        return res.status(400).json({ message: "groupId required" });
      }

      // 🔐 check membership
      const group = await Group.findOne({
        _id: groupId,
        "members.user": userId,
        company: req.user.company,
        isDeleted: false
      });

      if (!group) {
        return res.status(403).json({ message: "Not part of group" });
      }

      // ✅ check existing chat
      chat = await Chat.findOne({
        type: "group",
        group: groupId
      });

      // ✅ create if not exists
      if (!chat) {
        chat = await Chat.create({
          type: "group",
          group: groupId
        });
      }
    }

    else {
      return res.status(400).json({ message: "Invalid chat type" });
    }

    res.json({
      success: true,
      data: chat
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const io = getIO();

    const userId = req.user._id.toString();
    const { chatId, text } = req.body;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    /* ========= ATTACHMENTS ========= */

    let attachments = [];

    if (req.files?.length > 0) {
      attachments = req.files.map(file => {
        let type = "file";

        if (file.mimetype.startsWith("image")) type = "image";
        else if (file.mimetype === "application/pdf") type = "pdf";

        return {
          url: `/uploads/chatFile/${file.filename}`,
          type,
          fileName: file.originalname
        };
      });
    }

    if (!text && attachments.length === 0) {
      return res.status(400).json({
        message: "Message must contain text or attachments"
      });
    }

    /* ========= ONLINE USERS ========= */

    const onlineUsers = getAllUsers().map(id => id.toString());

    /* ========= DELIVERED USERS ========= */

    const participants = chat.participants.map(p => p.toString());

    const deliveredUsers = participants.filter(id =>
      onlineUsers.includes(id)
    );

    if (!deliveredUsers.includes(userId)) {
      deliveredUsers.push(userId);
    }

    /* ========= CREATE MESSAGE ========= */

    let message = await Message.create({
      chat: chatId,
      sender: userId,
      text,
      attachments,
      seenBy: [userId],
      deliveredTo: deliveredUsers
    });

    /* ========= POPULATE MESSAGE (🔥 IMPORTANT) ========= */

    message = await Message.findById(message._id)
      .populate("sender", "firstName lastName profilePic")
      .lean();

    /* ========= UPDATE CHAT ========= */

    chat.lastMessage = message._id;

    participants.forEach(id => {
      if (id !== userId) {
        const current = chat.unreadCount.get(id) || 0;
        chat.unreadCount.set(id, current + 1);
      }
    });

    await chat.save();

    /* ========= SOCKET: NEW MESSAGE ========= */

    io.to(`chat_${chatId}`).emit("receive_message", message);

    /* ========= SOCKET: DELIVERED ========= */

    deliveredUsers.forEach(id => {
      if (id !== userId) {
        io.to(`user_${id}`).emit("message_delivered", {
          chatId,
          messageId: message._id,
          deliveredTo: id
        });
      }
    });

    /* ========= UNREAD + NOTIFICATION ========= */

    const offlineUsers = participants.filter(
      id => id !== userId && !onlineUsers.includes(id)
    );

    const onlineReceivers = participants.filter(
      id => id !== userId && onlineUsers.includes(id)
    );

    // 🔥 UNREAD UPDATE
    onlineReceivers.forEach(id => {
      io.to(`user_${id}`).emit("unread_update", {
        chatId,
        unreadCount: chat.unreadCount.get(id)
      });

      io.to(`user_${id}`).emit("new_notification", {
        type: "message",
        chatId,
        message
      });
    });

    // 🔥 PUSH ONLY FOR OFFLINE USERS
    if (offlineUsers.length > 0) {
      const users = await User.find({
        _id: { $in: offlineUsers },
        fcmToken: { $exists: true }
      }).select("fcmToken");

      for (let user of users) {
        await admin.messaging().send({
          token: user.fcmToken,
          notification: {
            title: "New Message",
            body: text || "Sent an attachment"
          },
          data: {
            chatId: chatId.toString()
          }
        });
      }
    }

    /* ========= RESPONSE ========= */

    res.status(201).json({
      success: true,
      data: message
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.getMessages = async (req, res) => {
  try {
    const io = getIO();

    const userId = req.user._id.toString();
    const { chatId } = req.params;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 20, 1);
    const skip = (page - 1) * limit;

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    /* ================= PERMISSION CHECK ================= */

    if (chat.type === "direct") {
      const isParticipant = chat.participants.some(
        p => p.toString() === userId
      );
      if (!isParticipant) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    if (chat.type === "group") {
      const group = await Group.findOne({
        _id: chat.group,
        "members.user": userId,
        isDeleted: false
      });

      if (!group) {
        return res.status(403).json({ message: "Not in group" });
      }
    }

    if (chat.type === "ticket") {
      const ticket = await Ticket.findById(chat.ticket);

      if (!ticket || !ticket.chatEnabled || ticket.status === "closed") {
        return res.status(403).json({ message: "Ticket chat disabled" });
      }

      const allowed =
        ticket.createdBy.toString() === userId ||
        ticket.assignedTo.toString() === userId;

      if (!allowed) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    /* ================= FETCH ================= */

    const [messages, total] = await Promise.all([
      Message.find({
        chat: chatId,
        isDeleted: false
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "firstName lastName profilePic")
        .lean(),

      Message.countDocuments({
        chat: chatId,
        isDeleted: false
      })
    ]);

    /* ================= MESSAGE IDS (🔥 IMPORTANT) ================= */

    const messageIds = messages.map(m => m._id);

    /* ================= UPDATE DELIVERED + SEEN ================= */

    const updateResult = await Message.updateMany(
      {
        _id: { $in: messageIds },
        sender: { $ne: userId }
      },
      {
        $addToSet: {
          deliveredTo: userId,
          seenBy: userId
        }
      }
    );

    /* ================= RESET UNREAD ================= */

    if (chat.unreadCount?.get(userId) > 0) {
      chat.unreadCount.set(userId, 0);
      await chat.save();

      io.to(`user_${userId}`).emit("unread_update", {
        chatId,
        unreadCount: 0
      });
    }

    /* ================= SOCKET EVENTS (ONLY IF UPDATED) ================= */

    if (updateResult.modifiedCount > 0) {
      io.to(`chat_${chatId}`).emit("message_delivered", {
        chatId,
        userId
      });

      io.to(`chat_${chatId}`).emit("message_seen", {
        chatId,
        userId
      });
    }

    /* ================= RESPONSE ================= */

    res.json({
      success: true,
      data: messages.reverse(),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// exports.getChatList = async (req, res) => {
//   try {
//     const userId = req.user._id.toString();

//     /* ================= QUERY ================= */

//     const chats = await Chat.find({
//       $or: [
//         // ✅ Direct + Ticket chats (participants-based)
//         { participants: req.user._id },

//         // ✅ Group chats (must belong to group)
//         {
//           type: "group",
//           group: { $ne: null }
//         }
//       ]
//     })
//       .populate("participants", "firstName lastName profilePic")
//       .populate("group", "name members") // 🔥 include members
//       .populate("ticket", "title status createdBy assignedTo")
//       .populate({
//         path: "lastMessage",
//         populate: {
//           path: "sender",
//           select: "firstName lastName profilePic"
//         }
//       })
//       .sort({ updatedAt: -1 })
//       .lean();

//     /* ================= FILTER ================= */

//     const filteredChats = chats.filter(chat => {

//       /* ===== DIRECT ===== */
//       if (chat.type === "direct") {
//         return chat.participants.some(
//           p => p._id.toString() === userId
//         );
//       }

//       /* ===== GROUP (🔥 STRICT FIX) ===== */
//       if (chat.type === "group") {
//         if (!chat.group) return false;

//         const isMember = chat.group.members?.some(
//           m => m.user.toString() === userId
//         );

//         return isMember;
//       }

//       /* ===== TICKET (🔥 STRICT FIX) ===== */
//       if (chat.type === "ticket") {
//         if (!chat.ticket) return false;

//         const isParticipant = chat.participants.some(
//           p => p._id.toString() === userId
//         );

//         if (!isParticipant) return false;

//         // only active tickets
//         return ["accepted", "in_progress"].includes(chat.ticket.status);
//       }

//       return false;
//     });

//     /* ================= RESULT ================= */

//     const result = filteredChats.map(chat => {

//       const unreadCount = chat.unreadCount?.[userId] || 0;

//       let chatName = "";
//       let chatImage = null;

//       if (chat.type === "direct") {
//         const other = chat.participants.find(
//           p => p._id.toString() !== userId
//         );

//         chatName = `${other?.firstName || ""} ${other?.lastName || ""}`;
//         chatImage = other?.profilePic || null;
//       }

//       if (chat.type === "group") {
//         chatName = chat.group?.name || "Group";
//       }

//       if (chat.type === "ticket") {
//         chatName = `🎫 ${chat.ticket?.title || "Ticket"}`;
//       }

//       return {
//         _id: chat._id,
//         type: chat.type,
//         chatName,
//         chatImage,
//         lastMessage: chat.lastMessage,
//         unreadCount,
//         updatedAt: chat.updatedAt
//       };
//     });

//     res.json({
//       success: true,
//       data: result
//     });

//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };



exports.getChatList = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    const { type, ticketId } = req.query;

    /* ================= QUERY BUILD ================= */

    const baseQuery = {};

    // ✅ TYPE FILTER
    if (type) {
      baseQuery.type = type;
    }

    // ✅ TICKET ID FILTER
    if (ticketId && mongoose.Types.ObjectId.isValid(ticketId)) {
      baseQuery.ticket = ticketId;
    }

    // ✅ ACCESS CONTROL
    baseQuery.$or = [
      { participants: req.user._id }, // direct + ticket
      {
        type: "group",
        group: { $ne: null },
      },
    ];

    /* ================= FETCH ================= */

    const chats = await Chat.find(baseQuery)
      .populate("participants", "firstName lastName profilePic")
      .populate("group", "name members")
      .populate("ticket", "title status createdBy assignedTo")
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "firstName lastName profilePic",
        },
      })
      .sort({ updatedAt: -1 })
      .lean();

    /* ================= FILTER ================= */

    const filteredChats = chats.filter(chat => {

      if (chat.type === "direct") {
        return chat.participants.some(
          p => p._id.toString() === userId
        );
      }

      if (chat.type === "group") {
        if (!chat.group) return false;

        return chat.group.members?.some(
          m => m.user.toString() === userId
        );
      }

      if (chat.type === "ticket") {
        if (!chat.ticket) return false;

        const isParticipant = chat.participants.some(
          p => p._id.toString() === userId
        );

        if (!isParticipant) return false;

        return ["accepted", "in_progress"].includes(chat.ticket.status);
      }

      return false;
    });

    /* ================= RESULT ================= */

    const result = filteredChats.map(chat => {
      const unreadCount = chat.unreadCount?.[userId] || 0;

      let chatName = "";
      let chatImage = null;

      if (chat.type === "direct") {
        const other = chat.participants.find(
          p => p._id.toString() !== userId
        );

        chatName = `${other?.firstName || ""} ${other?.lastName || ""}`;
        chatImage = other?.profilePic || null;
      }

      if (chat.type === "group") {
        chatName = chat.group?.name || "Group";
      }

      if (chat.type === "ticket") {
        chatName = `🎫 ${chat.ticket?.title || "Ticket"}`;
      }

      return {
        _id: chat._id,
        type: chat.type,
        chatName,
        chatImage,
        lastMessage: chat.lastMessage,
        unreadCount,
        updatedAt: chat.updatedAt,
      };
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};