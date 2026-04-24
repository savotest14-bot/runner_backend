const mongoose = require("mongoose");

const employeePaymentSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },

        contract: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Contract",
        },
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },
        totalTimeSeconds: Number,
        totalTasks: Number,
        amount: Number,

        status: {
            type: String,
            enum: ["pending", "paid"],
            default: "pending",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("EmployeePayment", employeePaymentSchema);