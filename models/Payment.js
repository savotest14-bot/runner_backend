const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
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

    amount: {
      type: Number,
      required: true,
    },

    method: {
      type: String,
      enum: ["cash", "bank", "upi", "card"],
      required: true,
    },

    referenceId: String, // transaction id / UPI / bank ref

    paidAt: {
      type: Date,
      default: Date.now,
    },

    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);