// models/Ticket.js
const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    type: {
      type: String,
      enum: ["image", "pdf", "file"],
      required: true
    },
    fileName: String
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema({
  title: String,
  description: String,

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    default: null
  },

  // ✅ NEW: attachments
  attachments: {
    type: [attachmentSchema],
    default: []
  },

  status: {
    type: String,
    enum: ["open", "accepted", "in_progress", "closed"],
    default: "open",
    index: true
  },

  chatEnabled: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("Ticket", ticketSchema);