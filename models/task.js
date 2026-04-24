
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    taskName: {
      type: String,
      required: true,
      trim: true,
    },

    taskCategory: String,
    taskSubCategory: String,

    taskPrice: {
      type: Number,
      default: 0,
    },

    // ❌ REMOVE TIMER FROM TASK
    // ❌ REMOVE assignedTo

    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
      index: true,
    },

    subTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubTask",
      },
    ],
    scheduledDate: {
      type: Date,
      required: true,
      index: true,
    },
    taskDescription: String,
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Task", taskSchema);