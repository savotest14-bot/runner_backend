const mongoose = require("mongoose");

const workReportSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", required: true },

    employees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    employeeBreakdown: [
      {
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        totalTimeSeconds: Number,
        totalTasks: Number,
        totalAmount: Number, // only for per_service reference
      },
    ],

    totalTimeSeconds: { type: Number, default: 0 },
    totalHours: { type: Number, default: 0 },

    completedSubTasks: [
      {
        subTaskId: { type: mongoose.Schema.Types.ObjectId, ref: "SubTask" },
        name: String,
        price: Number, // reference only
        timeSeconds: Number,
        assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        afterWorkImagesdescription: {
          type: String,
          default: ""
        }
      },
    ],

    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },

    status: {
      type: String,
      enum: ["draft", "approved"],
      default: "draft",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: Date,

    reviewStatus: {
      type: String,
      enum: ["pending", "reviewed", "rejected"],
      default: "pending",
    },

    isEditable: {
      type: Boolean,
      default: true,
    },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },

    isBilled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkReport", workReportSchema);