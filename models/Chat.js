// models/Chat.js
const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["direct", "group", "ticket"],
    required: true
  },

  // direct chat
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  // group chat (link with your existing group)
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group"
  },

  // ticket chat
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket"
  },

  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message"
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },

}, { timestamps: true });

// indexes (important)
chatSchema.index({ type: 1 });
chatSchema.index({ group: 1 });
chatSchema.index({ ticket: 1 });

module.exports = mongoose.model("Chat", chatSchema);