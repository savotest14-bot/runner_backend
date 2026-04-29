const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    // 💰 FINAL AMOUNT (single source of truth)
    amount: {
      type: Number,
      required: true,
    },

    billingType: {
      type: String,
      enum: ["fixed", "per_service", "hourly"],
      required: true,
    },

    // 🔥 NEW STATUS FLOW
    status: {
      type: String,
      enum: ["draft", "sent", "partially_paid", "paid", "overdue"],
      default: "draft",
      index: true,
    },

    // 📅 DUE DATE
    dueDate: {
      type: Date,
      required: true,
    },

    // 💸 PAYMENT TRACKING
    paidAmount: {
      type: Number,
      default: 0,
    },

    remainingAmount: {
      type: Number,
      default: 0,
    },

    // 🧾 OPTIONAL (GOOD FOR UI)
    invoiceNumber: {
      type: String,
    },

    sentAt: Date,
    paidAt: Date,
  },
  { timestamps: true }
);

// 🔥 AUTO CALCULATE REMAINING
invoiceSchema.pre("save", function () {
  this.remainingAmount = this.amount - this.paidAmount;

  if (this.paidAmount === 0) {
    this.status = this.status === "draft" ? "draft" : "sent";
  } else if (this.paidAmount < this.amount) {
    this.status = "partially_paid";
  } else if (this.paidAmount >= this.amount) {
    this.status = "paid";
    this.paidAt = new Date();
  }

  // 🔥 NEW: overdue logic
  if (
    this.status !== "paid" &&
    this.dueDate &&
    new Date() > this.dueDate
  ) {
    this.status = "overdue";
  }
});

module.exports = mongoose.model("Invoice", invoiceSchema);