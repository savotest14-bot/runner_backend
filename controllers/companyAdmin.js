const Contract = require("../models/contract");
const { getFileUrl, deleteFileIfExists } = require("../functions/common");
const EmailTemplate = require("../models/contractTemplate");
const Company = require("../models/company");
const mongoose = require("mongoose");
const Role = require("../models/role");
const User = require("../models/user");
const Task = require("../models/task");
const SubTask = require("../models/subtask");
const WorkReport = require("../models/WorkReport");
const Invoice = require("../models/Invoice");
const EmployeePayment = require("../models/EmployeePayment");

// Clients

exports.getAllClientsForCompanyAdmin = async (req, res) => {
  try {
    const user = req.user;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access clients",
      });
    }

    const contracts = await Contract.find({
      company: user.company,
      isDeleted: false,
    })
      .populate("property")
      .populate("client")
      .select("property client")
      .lean();

    if (!contracts.length) {
      return res.status(200).json({
        success: true,
        totalClients: 0,
        totalTasks: 0,
        data: [],
      });
    }

    const clientMap = new Map();

    contracts.forEach(({ _id: contractId, client, property }) => {
      if (!client || client.isDeleted) return;

      const clientId = client._id.toString();

      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, {
          _id: client._id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          addressline1: client.addressLine1,
          addressline2:client.addressLine2,
          state:client.state,
          city: client.city,
          country: client.country,
          pincode:client.pincode,
          clientLogo: client.clientLogo,
          createdAt: client.createdAt,

          // Aggregated fields
          propertyNames: [],
          contractIds: [],
          totalTasks: 0, // ✅ TASK COUNT
        });
      }

      const existingClient = clientMap.get(clientId);

      // Add unique property names
      if (
        property?.propertyName &&
        !existingClient.propertyNames.includes(property.propertyName)
      ) {
        existingClient.propertyNames.push(property.propertyName);
      }

      // Track contracts (tasks)
      existingClient.contractIds.push(contractId);
      existingClient.totalTasks += 1; // ✅ INCREMENT TASK COUNT
    });

    const result = Array.from(clientMap.values()).map((client) => {
      if (client.clientLogo) {
        client.clientLogo = getFileUrl(req, client.clientLogo);
      }

      // ❌ Optional: remove internal ids if frontend doesn't need them
      delete client.contractIds;

      return client;
    });

    // ✅ Overall task count (all clients)
    const totalTasks = result.reduce(
      (sum, client) => sum + client.totalTasks,
      0,
    );

    return res.status(200).json({
      success: true,
      totalClients: result.length,
      totalTasks,
      data: result,
    });
  } catch (error) {
    console.error("Get all clients error:", error);
    return res.status(500).json({
      message: "Failed to fetch clients",
    });
  }
};

// Property

exports.getAllPropertiesForCompanyAdmin = async (req, res) => {
  try {
    const user = req.user;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access properties",
      });
    }

    const contracts = await Contract.find({
      company: user.company,
      isDeleted: false,
    })
      .populate("property")
      .populate("client")
      .populate("company", "companyName")
      .select("property client company")
      .lean();

    if (!contracts.length) {
      return res.status(200).json({
        success: true,
        totalProperties: 0,
        totalTasks: 0,
        data: [],
      });
    }

    const propertyMap = new Map();

    contracts.forEach(({ _id: contractId, property, client, company }) => {
      if (!property || property.isDeleted) return;
      if (!client || client.isDeleted) return;

      const propertyId = property._id.toString();

      if (!propertyMap.has(propertyId)) {
        propertyMap.set(propertyId, {
          _id: property._id,
          propertyName: property.propertyName,
          propertyType: property.propertyType,
          description: property.description,
          sizeSqm: property.sizeSqm,
          noOfResidents: property.noOfResidents,
          specialFeatureEndDate: property.specialFeatureEndDate,
          location:property.location,

          client: {
            _id: client._id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            city: client.city,
            country: client.country,
            clientLogo: client.clientLogo,
          },

          company: company
            ? {
              _id: company._id,
              companyName: company.companyName,
            }
            : null,

          contractIds: [],
          totalTasks: 0, // ✅ TASK COUNT PER PROPERTY
          createdAt: property.createdAt,
        });
      }

      const existingProperty = propertyMap.get(propertyId);

      existingProperty.contractIds.push(contractId);
      existingProperty.totalTasks += 1; // ✅ INCREMENT TASK COUNT
    });

    const result = Array.from(propertyMap.values()).map((property) => {
      if (property.client?.clientLogo) {
        property.client.clientLogo = getFileUrl(
          req,
          property.client.clientLogo,
        );
      }

      // ❌ Optional: remove internal ids
      delete property.contractIds;

      return property;
    });

    // ✅ OVERALL TASK COUNT (ALL PROPERTIES)
    const totalTasks = result.reduce(
      (sum, property) => sum + property.totalTasks,
      0,
    );

    return res.status(200).json({
      success: true,
      totalProperties: result.length,
      totalTasks,
      data: result,
    });
  } catch (error) {
    console.error("Get all properties error:", error);
    return res.status(500).json({
      message: "Failed to fetch properties",
    });
  }
};


exports.getTemplatesForAdmin = async (req, res) => {
  try {
    const templates = await EmailTemplate.find({ isActive: true });

    const result = templates.map((template) => {

      const previews = Object.entries(template.themes).map(
        ([themeName, themeColors]) => {

          let previewHtml = template.html;

          // ================= APPLY THEME =================
          Object.entries(themeColors).forEach(([key, value]) => {
            previewHtml = previewHtml.replaceAll(
              `{{${key}}}`,
              value || ""
            );
          });

          // ================= DUMMY DATA =================
          const dummyData = {
            COMPANY_NAME: "Runner Pvt Ltd",
            COMPANY_TAGLINE: "We make work easy",
            COMPANY_LOGO:
              "https://dummyimage.com/150x50/000/fff&text=LOGO",

            COMPANY_ADDRESS: "Indore, MP, India",
            COMPANY_PHONE: "+91 9876543210",

            CLIENT_NAME: "John Doe",
            CLIENT_ADDRESS: "Bhopal, MP, India",

            INVOICE_NO: "RUNIV-01",
            REFERENCE_NO: "INV-001",

            // 🔥 UPDATED (Task + SubTask)
            TASK_ROWS: `
              <tr style="background:#f9fafb; font-weight:bold;">
                <td style="padding:10px;">1</td>
                <td colspan="4">Cleaning</td>
              </tr>

              <tr>
                <td style="padding:10px;">1.1</td>
                <td style="padding-left:20px;">Floor Cleaning Area A</td>
                <td>5h</td>
                <td>₹500</td>
                <td>₹500</td>
              </tr>

              <tr>
                <td style="padding:10px;">1.2</td>
                <td style="padding-left:20px;">Window Cleaning</td>
                <td>2h</td>
                <td>₹300</td>
                <td>₹300</td>
              </tr>

              <tr style="background:#f3f4f6;">
                <td></td>
                <td colspan="3" align="right"><b>Task Total</b></td>
                <td><b>₹800</b></td>
              </tr>
            `,

            TOTAL: "₹800",

            // buttons (important for preview)
            ACCEPT_URL: "#",
            REJECT_URL: "#"
          };

          // ================= APPLY DUMMY DATA =================
          Object.entries(dummyData).forEach(([key, value]) => {
            previewHtml = previewHtml.replaceAll(
              `{{${key}}}`,
              value || ""
            );
          });

          return {
            theme: themeName,
            previewHtml
          };
        }
      );

      return {
        templateId: template._id,
        name: template.name,
        templateCode: template.templateCode,
        subject: template.subject,
        previews
      };
    });

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to load templates"
    });
  }
};


exports.updateCompanyLogo = async (req, res) => {
  try {
    const companyId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ message: "No logo file uploaded" });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Company not found" });
    }

    if (company.logo) {
      deleteFileIfExists(company.logo)
    }

    company.logo = `/uploads/company-logos/${req.file.filename}`;
    await company.save();

    return res.status(200).json({
      message: "Company logo updated successfully",
      logo: company.logo,
    });
  } catch (error) {
    console.error("Error updating company logo:", error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({ message: "Failed to update company logo" });
  }
};


exports.getCompanyAdminDashboard = async (req, res) => {
  try {
    const companyId = new mongoose.Types.ObjectId(req.user.company);
    const currentYear = new Date().getFullYear();

    const employeeRole = await Role.findOne({ name: "employee" }).select("_id");

    if (!employeeRole) {
      return res.status(500).json({ message: "Employee role not found" });
    }

    // ================= CARDS =================

    const totalContracts = await Contract.countDocuments({
      company: companyId,
      isDeleted: false,
    });

    const totalEmployees = await User.countDocuments({
      company: companyId,
      role: employeeRole._id,
      isDeleted: false,
    });

    const totalTasks = await Task.countDocuments({
      company: companyId,
      isDeleted: false,
    });

    // ================= 🔥 REVENUE FROM INVOICE =================

    const totalIncomeAgg = await Invoice.aggregate([
      { $match: { company: companyId } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const totalIncome = totalIncomeAgg[0]?.total || 0;

    // ================= 🔥 YEARLY SALES =================

    const yearlySales = await Invoice.aggregate([
      {
        $match: {
          company: companyId,
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { "_id": 1 } },
    ]);

    // ================= 🔥 EXPENSE (EMPLOYEE COST) =================

    const totalExpenseAgg = await EmployeePayment.aggregate([
      { $match: { company: companyId } },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const totalExpense = totalExpenseAgg[0]?.total || 0;

    const profit = totalIncome - totalExpense;

    // ================= RECENT ACTIVITY =================

    const recentActivity = await SubTask.find({
      company: companyId,
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select("subTaskName status updatedAt");

    // ================= EMPLOYEES =================

    const employees = await User.find({
      company: companyId,
      role: employeeRole._id,
      isDeleted: false,
    })
      .limit(5)
      .select("firstName lastName email isApproved");

    // ================= TASKS =================

    const tasks = await Task.aggregate([
      {
        $match: {
          company: companyId,
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "assignedBy",
          foreignField: "_id",
          as: "assignedBy",
        },
      },
      {
        $unwind: {
          path: "$assignedBy",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          taskId: "$_id",
          taskName: 1,
          status: 1,
          createdAt: 1,
          assignedBy: {
            name: {
              $concat: [
                { $ifNull: ["$assignedBy.firstName", ""] },
                " ",
                { $ifNull: ["$assignedBy.lastName", ""] },
              ],
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
    ]);

    // ================= SUBTASK STATS =================

    const subTaskStatsAgg = await SubTask.aggregate([
      { $match: { company: companyId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    let completed = 0,
      inProgress = 0,
      pending = 0;

    subTaskStatsAgg.forEach((item) => {
      if (item._id === "completed") completed = item.count;
      if (item._id === "in_progress") inProgress = item.count;
      if (item._id === "pending") pending = item.count;
    });

    const totalSubTasks = completed + inProgress + pending;

    const active = await SubTask.countDocuments({
      company: companyId,
      status: "in_progress",
      timerStartedAt: { $ne: null },
    });

    const overdue = await SubTask.countDocuments({
      company: companyId,
      status: { $ne: "completed" },
      expectedEndTime: { $lt: new Date() },
    });

    const completionRate =
      totalSubTasks > 0
        ? Math.round((completed / totalSubTasks) * 100)
        : 0;

    // ================= RESPONSE =================

    return res.status(200).json({
      success: true,
      data: {
        cards: {
          totalContracts,
          totalEmployees,
          totalTasks,
          totalIncome,   // 🔥 NEW
          totalExpense,  // 🔥 NEW
          profit,        // 🔥 NEW
        },

        subTaskStats: {
          total: totalSubTasks,
          completed,
          inProgress,
          pending,
          active,
          overdue,
          completionRate,
        },

        yearlySales: {
          totalIncome,
          monthly: yearlySales,
        },

        recentActivity,
        employees,
        tasks,
      },
    });

  } catch (error) {
    console.error("Company dashboard error:", error);
    return res.status(500).json({
      message: "Failed to load dashboard",
    });
  }
};


