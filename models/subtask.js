const mongoose = require("mongoose");

const subTaskSchema = new mongoose.Schema(
  {
    subTaskName: { type: String, required: true },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },

    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ✅ ADD ESTIMATION HERE
    estimatedDurationSeconds: {
      type: Number,
      default: 0,
    },
    subtaskPrice:{
      type:Number,
      default:0
    },
    // ✅ ACTUAL TIMER
    timerStartedAt: Date,
    expectedEndTime: {
      type: Date,
      default: null
    },
    timerCompletedAt: Date,
    totalTimeSeconds: {
      type: Number,
      default: 0,
    },

    // 📸 IMAGES
    beforeWorkImages: [
      {
        url: String,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    afterWorkImages: [
      {
        url: String,
        uploadedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },

        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
     afterWorkImagesdescription: {
          type: String,
          trim: true,
          default: "",
        },

    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
  },
  { timestamps: true }
);
subTaskSchema.index({ task: 1 });
module.exports = mongoose.model("SubTask", subTaskSchema);