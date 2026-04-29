// models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chat",
    required: true,
    index: true
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  text: {
    type: String,
    trim: true
  },

  attachments: [
    {
      url: String,
      type: {
        type: String,
        enum: ["image", "pdf", "file"]
      }
    }
  ],
  deliveredTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  seenBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],

  isDeleted: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

messageSchema.index({ chat: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);