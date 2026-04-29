const mongoose = require("mongoose");

const employeePaymentSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        report: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WorkReport"
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
        paymentType: String,
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