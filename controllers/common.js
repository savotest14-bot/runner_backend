const { deleteFileIfExists } = require("../functions/common");
const User = require("../models/user");
const WorkReport = require("../models/WorkReport");
const Invoice = require("../models/Invoice");
const EmployeePayment = require("../models/EmployeePayment")
const Contract = require("../models/contract");
const buildInvoiceEmail = require("../utils/emailTemplates/invoiceEmail");
const { sendSimpleMail } = require("../functions/sendSimpleMail");
const SubTask = require("../models/subtask");
const Payment = require("../models/Payment");

exports.updateMyProfilePic = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!req.file) {
      return res.status(400).json({
        message: "Profile image is required",
      });
    }

    const newProfilePic =
      req.file.path || req.file.location || req.file.url;

    const user = await User.findOne({
      _id: userId,
      isDeleted: false,
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.profilePic) {
      deleteFileIfExists(user.profilePic);
    }

    user.profilePic = newProfilePic;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePic: newProfilePic,
    });
  } catch (error) {
    console.error("Update profile pic error:", error);
    return res.status(500).json({
      message: "Failed to update profile picture",
    });
  }
};


exports.getAllWorkReports = async (req, res) => {
  try {
    const user = req.user;

    // ======================================================
    // ✅ PAGINATION
    // ======================================================
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    // ======================================================
    // ✅ QUERY PARAMS
    // ======================================================
    const { status, contractId, search, reviewStatus } = req.query;

    const filter = {};

    // ======================================================
    // ✅ ROLE CHECK
    // ======================================================
    const isSuperAdmin = user.role.name === "superAdmin";

    // 🔥 Company restriction for non-superAdmin
    if (!isSuperAdmin) {
      filter.company = user.company;
    }

    // ======================================================
    // ✅ STATUS FILTER
    // ======================================================
    if (status) {
      filter.status = status;
    }

    // ======================================================
    // ✅ REVIEW STATUS FILTER (NEW)
    // ======================================================
    if (reviewStatus) {
      filter.reviewStatus = reviewStatus;
    }

    // ======================================================
    // 🔍 CONTRACT FILTER LOGIC
    // ======================================================

    let contractIds = [];

    // 🔹 Direct contractId
    if (contractId) {
      contractIds = [contractId];
    }

    // 🔹 Search by contractNumber
    if (search) {
      const searchRegex = new RegExp(search, "i");

      const contractFilter = {
        contractNumber: searchRegex,
      };

      // 🔥 Apply company restriction in search
      if (!isSuperAdmin) {
        contractFilter.company = user.company;
      }

      const contracts = await Contract.find(contractFilter).select("_id");

      const searchContractIds = contracts.map(c => c._id.toString());

      if (contractIds.length) {
        // ✅ intersection (contractId + search)
        contractIds = contractIds.filter(id =>
          searchContractIds.includes(id.toString())
        );
      } else {
        contractIds = searchContractIds;
      }
    }

    // 🔹 Apply contract filter
    if (contractIds.length) {
      filter.contract = { $in: contractIds };
    }

    // 🔹 If search provided but no match → return empty
    if (search && contractIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No reports found",
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      });
    }

    // ======================================================
    // 📊 FETCH DATA
    // ======================================================
    const [reports, total] = await Promise.all([
      WorkReport.find(filter)
        .populate("task", "taskName status scheduledDate")
        .populate("contract", "contractNumber billingType")
        .populate("employees", "firstName lastName")
        .populate("reviewedBy", "firstName lastName")
        .populate("employeeBreakdown.employee", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      WorkReport.countDocuments(filter),
    ]);

    // ======================================================
    // ✅ RESPONSE
    // ======================================================
    return res.status(200).json({
      success: true,
      message: "Work reports fetched successfully",
      data: reports,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error("Get all reports error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
    });
  }
};

exports.getWorkReportDetails = async (req, res) => {
  try {
    const { reportId } = req.params;
    const user = req.user;

    const filter = { _id: reportId };

    // ✅ Company restriction
    if (user.role.name === "company_admin") {
      filter.company = user.company;
    }

    const report = await WorkReport.findOne(filter)
      // 🔹 Task
      .populate("task")

      // 🔹 Contract + Client + Property
      .populate({
        path: "contract",
        populate: [
          {
            path: "client",
            select: "name email phone",
          },
          {
            path: "property",
          },
        ],
      })

      // 🔹 Employees
      .populate("employees")

      // 🔹 Employee Breakdown
      .populate("employeeBreakdown.employee")
      .populate("reviewedBy", "firstName lastName")
      // 🔥 FULL SUBTASK POPULATE (IMPORTANT)
      .populate({
        path: "completedSubTasks.subTaskId",
        populate: [
          {
            path: "assignedTo",
            select: "firstName lastName email",
          },
          {
            path: "assignedBy",
            select: "firstName lastName",
          },
        ],
      })

      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: report,
    });

  } catch (err) {
    console.error("Get report details error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching report",
    });
  }
};

exports.updateWorkReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { subTaskId, afterWorkImagesdescription } = req.body;

    const report = await WorkReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (!report.isEditable) {
      return res.status(400).json({
        message: "Report is locked after approval",
      });
    }

    // 🔥 find specific subtask inside report
    const subTask = report.completedSubTasks.find(
      (s) => s.subTaskId.toString() === subTaskId
    );

    if (!subTask) {
      return res.status(404).json({
        message: "SubTask not found in report",
      });
    }

    // ✅ update allowed fields only
    if (afterWorkImagesdescription !== undefined) {
      subTask.afterWorkImagesdescription = afterWorkImagesdescription;
    }

    await report.save();

    return res.json({
      success: true,
      message: "Report updated successfully",
      data: report,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update report" });
  }
};

const generateInvoice = async (contractId) => {
  const contract = await Contract.findById(contractId);
  if (!contract) throw new Error("Contract not found");

  const reports = await WorkReport.find({
    contract: contractId,
    status: "approved",
    isBilled: false,
  });

  if (!reports.length) return;

  let totalAmount = 0;

  // ================= BILLING =================

  if (contract.billingType === "fixed") {
    const existing = await Invoice.findOne({
      contract: contractId,
      billingType: "fixed",
    });

    if (existing) return;

    totalAmount = contract.totalCost;
  }

  if (contract.billingType === "per_service") {
    totalAmount = reports.reduce((sum, r) => {
      return sum + r.completedSubTasks.reduce(
        (s, sub) => s + (sub.price || 0),
        0
      );
    }, 0);
  }

  if (contract.billingType === "hourly") {
    const totalHours = reports.reduce(
      (sum, r) => sum + (r.totalHours || 0),
      0
    );

    totalAmount = totalHours * (contract.hourlyRate || 0);
  }

  // ================= CREATE DRAFT INVOICE =================

  const invoice = await Invoice.create({
    contract: contractId,
    client: contract.client,
    company: contract.company,
    amount: totalAmount,
    billingType: contract.billingType,
    status: "draft", // ✅ IMPORTANT
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
    invoiceNumber: contract.invoiceNumber
  });

  // ================= MARK REPORTS =================

  await WorkReport.updateMany(
    { _id: { $in: reports.map(r => r._id) } },
    { isBilled: true }
  );

  return invoice;
};

const generateEmployeePayments = async (contractId) => {
  const reports = await WorkReport.find({
    contract: contractId,
    status: "approved",
    isBilled: false, // 🔥 ADD THIS
  });

  const employeeMap = {};

  for (const report of reports) {
    const breakdown = report.employeeBreakdown || []; // ✅ safe

    for (const emp of breakdown) {
      const id = emp.employee.toString();

      if (!employeeMap[id]) {
        employeeMap[id] = {
          totalTime: 0,
          totalTasks: 0,
          totalAmount: 0,
        };
      }

      employeeMap[id].totalTime += emp.totalTimeSeconds || 0;
      employeeMap[id].totalTasks += emp.totalTasks || 0;
      employeeMap[id].totalAmount += emp.totalAmount || 0;
    }
  }

  for (const empId in employeeMap) {
    const data = employeeMap[empId];

    const employee = await User.findById(empId);
    if (!employee) continue;

    const paymentConfig =
      employee.employeeProfile?.employeePayment || {};

    const type = paymentConfig.type || "hourly";

    let amount = 0;

    // ✅ prevent duplicate payment
    const alreadyExists = await EmployeePayment.findOne({
      employee: empId,
      contract: contractId,
      paymentType: type,
    });

    if (alreadyExists && type !== "hourly") continue;

    if (type === "hourly") {
      amount =
        (data.totalTime / 3600) *
        (paymentConfig.hourlyRate || 0);
    } else if (type === "per_service") {
      amount = data.totalAmount;
    } else if (type === "fixed") {
      amount = paymentConfig.fixedSalary || 0;
    }

    await EmployeePayment.create({
      employee: empId,
      contract: contractId,
      company: employee.company,
      totalTimeSeconds: data.totalTime,
      totalTasks: data.totalTasks,
      amount,
      paymentType: type,
    });
  }
};


exports.approveWorkReport = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await WorkReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.status === "approved") {
      return res.status(400).json({ message: "Already approved" });
    }

    // ✅ APPROVE
    report.status = "approved";
    report.isEditable = false; // 🔥 lock
    report.approvedBy = req.user._id;
    report.approvedAt = new Date();

    await report.save();


    // 🔥 PAYROLL (OK to auto)
    await generateEmployeePayments(report.contract);

    // 🔥 CREATE DRAFT INVOICE ONLY
    const invoice = await generateInvoice(report.contract);

    return res.json({
      success: true,
      message: "Report approved & draft invoice created",
      invoiceId: invoice?._id || null,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error approving report" });
  }
};

exports.sendInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: "contract",
        populate: {
          path: "property",
        },
      })
      .populate("client")
      .populate("company");

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status !== "draft") {
      return res.status(400).json({
        message: "Invoice already sent",
      });
    }

    const reports = await WorkReport.find({
      contract: invoice.contract._id,
      status: "approved",
    });

    const subTaskIds = reports.flatMap(r =>
      r.completedSubTasks.map(s => s.subTaskId)
    );

    const subTasks = await SubTask.find({
      _id: { $in: subTaskIds },
    });

    const html = buildInvoiceEmail({
      contract: invoice.contract,
      property: invoice.contract.property,
      client: invoice.client,
      reports,
      subTasks,
      invoice,
    });

    await sendSimpleMail({
      to: invoice.client.email,
      subject: `Invoice - ${invoice.contract.contractNumber}`,
      html,
    });

    // ✅ UPDATE STATUS
    invoice.status = "sent";
    await invoice.save();

    return res.json({
      success: true,
      message: "Invoice sent successfully",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error sending invoice" });
  }
};


exports.payInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { amount, method, referenceId, notes } = req.body;

    const invoice = await Invoice.findById(invoiceId);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status === "paid") {
      return res.status(400).json({
        message: "Invoice already fully paid",
      });
    }

    // 🔥 validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        message: "Invalid payment amount",
      });
    }

    if (amount > invoice.remainingAmount) {
      return res.status(400).json({
        message: "Amount exceeds remaining balance",
      });
    }

    // ================= CREATE PAYMENT =================

    await Payment.create({
      invoice: invoice._id,
      client: invoice.client,
      company: invoice.company,
      amount,
      method,
      referenceId,
      notes,
    });

    // ================= UPDATE INVOICE =================

    invoice.paidAmount += amount;

    // 🔥 status handled by pre-save hook
    await invoice.save();

    return res.json({
      success: true,
      message: "Payment recorded successfully",
      data: {
        paidAmount: invoice.paidAmount,
        remainingAmount: invoice.remainingAmount,
        status: invoice.status,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Payment failed" });
  }
};


exports.getInvoicePayments = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const payments = await Payment.find({
      invoice: invoiceId,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: payments,
    });

  } catch (err) {
    res.status(500).json({ message: "Error fetching payments" });
  }
};