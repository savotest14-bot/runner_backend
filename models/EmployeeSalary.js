const mongoose = require("mongoose");

const employeeSalarySchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },

    // 🗓️ Salary period
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    // 📊 Aggregated data
    totalContracts: { type: Number, default: 0 },
    totalTasks: { type: Number, default: 0 },
    totalTimeSeconds: { type: Number, default: 0 },

    // 💰 Earnings (from EmployeePayment)
    grossAmount: { type: Number, default: 0 },

    // ➕ Bonus
    bonus: { type: Number, default: 0 },

    // ➖ Deductions
    deduction: { type: Number, default: 0 },

    deductionBreakdown: {
      pf: { type: Number, default: 0 },
      esi: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },

    // 💵 Final salary
    netSalary: { type: Number, default: 0 },

    // 🔐 Approval
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: Date,

    status: {
      type: String,
      enum: ["pending", "approved", "paid"],
      default: "pending",
    },

    paidAt: Date,
  },
  { timestamps: true }
);


// 🚫 prevent duplicate salary per month
employeeSalarySchema.index(
  { employee: 1, month: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model("EmployeeSalary", employeeSalarySchema);