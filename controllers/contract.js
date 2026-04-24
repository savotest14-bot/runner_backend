const mongoose = require("mongoose");
const Client = require("../models/client");
const Property = require("../models/property");
const Task = require("../models/task");
const Contract = require("../models/contract");
const Company = require("../models/company");
const { getFileUrl } = require("../functions/common");
const formatNumber = require("../utils/formatNumber");
const getNextSequence = require("../utils/getNextSequence");
const buildContractEmail = require("../services/emailTemplateBuilder");
const { sendSimpleMail } = require("../functions/sendSimpleMail");
const SubTask = require("../models/subtask");

/**Super Admin */


const parseIfString = (data, fieldName) => {
  try {
    if (typeof data === "string") {
      return JSON.parse(data);
    }
    return data;
  } catch (err) {
    throw new Error(`Invalid JSON format in field: ${fieldName}`);
  }
};


exports.createContract = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.user.role.name !== "superAdmin") {
      return res.status(403).json({ message: "Access denied" });
    }

    let {
      contractType,
      startDate,
      endDate,
      company,
      client,
      property,
      tasks = [],
      billingType = "per_service",
      hourlyRate = 0
    } = req.body;

    client = parseIfString(client);
    property = parseIfString(property);
    tasks = parseIfString(tasks);

    // ================= FETCH COMPANY =================
    const companyDetails = await Company.findById(company);

    // ================= HELPERS =================
    const normalizeAssignedTo = (assigned) => {
      if (!assigned) return [];

      if (Array.isArray(assigned)) {
        return assigned.map((id) => id.toString().trim()).filter(Boolean);
      }

      if (typeof assigned === "object") {
        return Object.values(assigned).map((id) =>
          id.toString().trim()
        );
      }

      if (typeof assigned === "string") {
        return assigned
          .replace(/[\[\]'"]/g, "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
      }

      return [];
    };

    const toSeconds = (value, unit) => {
      const map = {
        years: 31536000,
        months: 2592000,
        days: 86400,
        hours: 3600,
        minutes: 60,
        seconds: 1,
      };
      return Number(value) * (map[unit] || 1);
    };

    // ================= CLIENT =================
    const [createdClient] = await Client.create(
      [{ ...client, company }],
      { session }
    );

    // ================= PROPERTY =================
    const [createdProperty] = await Property.create(
      [
        {
          ...property,
          client: createdClient._id,
        },
      ],
      { session }
    );

    // ================= TASK + SUBTASK =================
    const createdTasks = [];
    let totalEstimatedSeconds = 0;
    let totalCost = 0;

    for (const task of tasks || []) {

      const [createdTask] = await Task.create(
        [
          {
            taskName: task.taskName,
            taskCategory: task.taskCategory,
            taskSubCategory: task.taskSubCategory,
            taskDescription: task.description,
            scheduledDate: task.scheduledDate,
            taskPrice: 0,
            company,
            assignedBy: req.user._id,
            status: "pending",
          },
        ],
        { session }
      );

      let taskTotalPrice = 0;
      const subTaskIds = [];

      for (const sub of task.subTasks || []) {

        if (!sub.taskDuration || !sub.taskDurationUnit) {
          throw new Error("SubTask duration required");
        }

        if (sub.subtaskPrice === undefined) {
          throw new Error("SubTask price is required");
        }

        const estimatedSeconds = toSeconds(
          sub.taskDuration,
          sub.taskDurationUnit
        );

        const subPrice = Number(sub.subtaskPrice) || 0;

        const [createdSubTask] = await SubTask.create(
          [
            {
              subTaskName: sub.subTaskName,
              task: createdTask._id,
              assignedTo: normalizeAssignedTo(sub.assignedTo),
              assignedBy: req.user._id,
              company,
              estimatedDurationSeconds: estimatedSeconds,
              subtaskPrice: subPrice,
              status: "pending",
            },
          ],
          { session }
        );

        subTaskIds.push(createdSubTask._id);

        taskTotalPrice += subPrice;
        totalEstimatedSeconds += estimatedSeconds;
      }

      createdTask.subTasks = subTaskIds;
      createdTask.taskPrice = taskTotalPrice;

      await createdTask.save({ session });

      totalCost += taskTotalPrice;
      createdTasks.push(createdTask);
    }

    // ================= INVOICE + REFERENCE =================
    const invoiceSeq = await getNextSequence("invoice", session);
    const referenceSeq = await getNextSequence("reference", session);

    const invoiceNumber = formatNumber("RUNIV", invoiceSeq, 2);
    const referenceNumber = formatNumber("INV", referenceSeq, 3);

    const contractNumber = `CON-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    // ================= CONTRACT =================
    const [contract] = await Contract.create(
      [
        {
          contractNumber,
          invoiceNumber,
          referenceNumber,
          contractType,
          startDate,
          endDate,

          client: createdClient._id,
          property: createdProperty._id,
          tasks: createdTasks.map((t) => t._id),

          totalTasks: createdTasks.length,
          totalEstimatedSeconds,
          totalCost,
          billingType,
          hourlyRate,
          company,
          createdBy: req.user._id,
          emailStatus: "pending",
        },
      ],
      { session }
    );

    // ================= COMMIT =================
    await session.commitTransaction();
    session.endSession();

    // ================= EMAIL (YOUR STYLE) =================
    try {

      const emailHtml = await buildContractEmail({
        contract,
        client: createdClient,
        company: companyDetails,
        templateCode: req.body.emailTemplateCode || "invoice_v1",
        themeName: req.body.theme || "blue",
        frontendUrl: process.env.BACKEND_URL // ✅ FIXED
      });

      await sendSimpleMail({
        to: createdClient.email,
        subject: `Invoice ${contract.invoiceNumber}`, // ✅ YOUR REQUIREMENT
        html: emailHtml
      });

      contract.emailStatus = "sent";
      await contract.save();

    } catch (emailError) {
      console.error("Email send failed:", emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: "Contract created successfully",
      data: contract,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error(err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create contract",
    });
  }
};

exports.getSingleContractBySuperAdmin = async (req, res) => {
  try {
    if (req.user.role.name !== "superAdmin") {
      return res.status(403).json({
        message: "Only super admin can access this contract",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid contract id",
      });
    }

    const contract = await Contract.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate("client", "name email phone city country clientLogo")
      .populate("property", "propertyName propertyType sizeSqm")
      .populate("company", "companyName")
      .populate("createdBy", "firstName lastName email")
      .populate({
        path: "tasks",
        select: "taskName taskCategory taskSubCategory taskPrice status",
        populate: {
          path: "subTasks",
          populate: {
            path: "assignedTo",
            select: "firstName lastName email",
          },
        },
      })
      .lean();

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found",
      });
    }

    // ✅ FIX FILE URLS
    if (contract.client?.clientLogo) {
      contract.client.clientLogo = getFileUrl(
        req,
        contract.client.clientLogo
      );
    }

    if (contract.additionalDocuments?.length) {
      contract.additionalDocuments = contract.additionalDocuments.map(
        (doc) => ({
          ...doc,
          fileUrl: getFileUrl(req, doc.fileUrl),
        })
      );
    }

    return res.status(200).json({
      success: true,
      data: contract,
    });

  } catch (error) {
    console.error("Get contract by superAdmin error:", error);
    return res.status(500).json({
      message: "Failed to fetch contract",
    });
  }
};

exports.getAllContracts = async (req, res) => {
  try {
    if (req.user.role.name !== "superAdmin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const contracts = await Contract.find({ isDeleted: false })
      .populate("client", "name email city clientLogo")
      .populate("property", "propertyName")
      .populate("company", "companyName")
      .populate("tasks", "taskName taskPrice")
      .lean();

    const formattedContracts = contracts.map((contract) => {
      if (contract.client?.clientLogo) {
        contract.client.clientLogo = getFileUrl(
          req,
          contract.client.clientLogo,
        );
      }

      if (contract.additionalDocuments?.length) {
        contract.additionalDocuments = contract.additionalDocuments.map(
          (doc) => ({
            ...doc,
            fileUrl: getFileUrl(req, doc.fileUrl),
          }),
        );
      }

      return contract;
    });

    res.status(200).json({
      success: true,
      data: formattedContracts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch contracts" });
  }
};

exports.getSingleContractBySuperAdmin = async (req, res) => {
  try {
    if (req.user.role.name !== "superAdmin") {
      return res.status(403).json({
        message: "Only super admin can access this contract",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid contract id",
      });
    }

    const contract = await Contract.findOne({
      _id: id,
      isDeleted: false,
    })
      .populate("client", "name email phone city country clientLogo")
      .populate("property", "propertyName propertyType sizeSqm")
      .populate("company", "companyName")
      .populate("createdBy", "firstName lastName email")

      // ✅ FIXED HERE
      .populate({
        path: "tasks",
        select: "taskName taskCategory taskSubCategory taskPrice status",
        populate: {
          path: "subTasks",
          populate: {
            path: "assignedTo",
            select: "firstName lastName email",
          },
        },
      })

      .lean();

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found",
      });
    }

    // ✅ FILE URL FIX
    if (contract.client?.clientLogo) {
      contract.client.clientLogo = getFileUrl(
        req,
        contract.client.clientLogo
      );
    }

    if (contract.additionalDocuments?.length) {
      contract.additionalDocuments = contract.additionalDocuments.map(
        (doc) => ({
          ...doc,
          fileUrl: getFileUrl(req, doc.fileUrl),
        })
      );
    }

    return res.status(200).json({
      success: true,
      data: contract,
    });

  } catch (error) {
    console.error("Get contract by superAdmin error:", error);
    return res.status(500).json({
      message: "Failed to fetch contract",
    });
  }
};

/**Company Admin */



// exports.createContractByCompanyAdmin = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     if (req.user.role.name !== "company_admin") {
//       return res.status(403).json({ message: "Access denied" });
//     }

//     let {
//       contractType,
//       startDate,
//       endDate,
//       client,
//       property,
//       tasks = [],
//     } = req.body;

//     client = parseIfString(client);
//     property = parseIfString(property);
//     tasks = parseIfString(tasks);
//     const company = req.user.company;
//     // ✅ NORMALIZE assignedTo
//     const normalizeAssignedTo = (assigned) => {
//       if (!assigned) return [];

//       if (Array.isArray(assigned)) {
//         return assigned.map((id) => id.toString().trim()).filter(Boolean);
//       }

//       if (typeof assigned === "object") {
//         return Object.values(assigned).map((id) =>
//           id.toString().trim()
//         );
//       }

//       if (typeof assigned === "string") {
//         return assigned
//           .replace(/[\[\]'"]/g, "")
//           .split(",")
//           .map((id) => id.trim())
//           .filter(Boolean);
//       }

//       return [];
//     };

//     // ✅ TIME CONVERTER
//     const toSeconds = (value, unit) => {
//       const map = {
//         years: 31536000,
//         months: 2592000,
//         days: 86400,
//         hours: 3600,
//         minutes: 60,
//         seconds: 1,
//       };
//       return Number(value) * (map[unit] || 1);
//     };

//     // ================= CLIENT =================
//     const [createdClient] = await Client.create(
//       [{ ...client, company }],
//       { session }
//     );

//     // ================= PROPERTY =================
//     const [createdProperty] = await Property.create(
//       [
//         {
//           ...property,
//           client: createdClient._id,
//           location: {
//             type: "Point",
//             coordinates: property.location.coordinates,
//             address: property.location.address || "",
//           },
//         },
//       ],
//       { session }
//     );

//     // ================= TASK + SUBTASK =================

//     const createdTasks = [];
//     let totalEstimatedSeconds = 0;
//     let totalCost = 0; // 🔥 TOTAL CONTRACT COST

//     for (const task of tasks || []) {

//       // ✅ CREATE TASK (price = 0 initially)
//       const [createdTask] = await Task.create(
//         [
//           {
//             taskName: task.taskName,
//             taskCategory: task.taskCategory,
//             taskSubCategory: task.taskSubCategory,
//             taskDescription: task.description,
//             taskPrice: 0, // 🔥 will update later
//             company,
//             assignedBy: req.user._id,
//             status: "pending",
//           },
//         ],
//         { session }
//       );

//       let taskTotalPrice = 0; // 🔥 PER TASK TOTAL
//       const subTaskIds = [];

//       for (const sub of task.subTasks || []) {

//         if (!sub.taskDuration || !sub.taskDurationUnit) {
//           throw new Error("SubTask duration required");
//         }

//         if (sub.subtaskPrice === undefined) {
//           throw new Error("SubTask price is required");
//         }

//         const estimatedSeconds = toSeconds(
//           sub.taskDuration,
//           sub.taskDurationUnit
//         );

//         const subPrice = Number(sub.subtaskPrice) || 0;

//         const [createdSubTask] = await SubTask.create(
//           [
//             {
//               subTaskName: sub.subTaskName,
//               task: createdTask._id,
//               assignedTo: normalizeAssignedTo(sub.assignedTo),
//               assignedBy: req.user._id,
//               company,

//               estimatedDurationSeconds: estimatedSeconds,
//               subtaskPrice: subPrice, // ✅ SAVE PRICE HERE

//               status: "pending",
//               timerStartedAt: null,
//               timerCompletedAt: null,
//               totalTimeSeconds: 0,
//             },
//           ],
//           { session }
//         );

//         subTaskIds.push(createdSubTask._id);

//         // ✅ SUM PRICE
//         taskTotalPrice += subPrice;

//         // ✅ SUM TIME
//         totalEstimatedSeconds += estimatedSeconds;
//       }

//       // ✅ UPDATE TASK
//       createdTask.subTasks = subTaskIds;
//       createdTask.taskPrice = taskTotalPrice;

//       await createdTask.save({ session });

//       // ✅ ADD TO CONTRACT TOTAL
//       totalCost += taskTotalPrice;

//       createdTasks.push(createdTask);
//     }

//     // ================= CONTRACT =================

//     const totalTasks = createdTasks.length;

//     const contractNumber = `CON-${Date.now()}`;

//     const [contract] = await Contract.create(
//       [
//         {
//           contractNumber,
//           contractType,
//           startDate,
//           endDate,

//           client: createdClient._id,
//           property: createdProperty._id,
//           tasks: createdTasks.map((t) => t._id),

//           totalTasks,
//           totalEstimatedSeconds,
//           totalCost, // 🔥 NOW CORRECT

//           company,
//           createdBy: req.user._id,
//         },
//       ],
//       { session }
//     );

//     await session.commitTransaction();
//     session.endSession();

//     return res.status(201).json({
//       success: true,
//       message: "Contract created successfully",
//       data: contract,
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();

//     console.error(err);
//     return res.status(500).json({
//       success: false,
//       message: err.message || "Failed to create contract",
//     });
//   }
// };


exports.createContractByCompanyAdmin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.user.role.name !== "superAdmin") {
      return res.status(403).json({ message: "Access denied" });
    }

    let {
      contractType,
      startDate,
      endDate,
      client,
      property,
      tasks = [],
      billingType = "per_service",
      hourlyRate = 0
    } = req.body;

    client = parseIfString(client);
    property = parseIfString(property);
    tasks = parseIfString(tasks);
    const company = req.user.company;
    // ================= FETCH COMPANY =================
    const companyDetails = await Company.findById(company);

    // ================= HELPERS =================
    const normalizeAssignedTo = (assigned) => {
      if (!assigned) return [];

      if (Array.isArray(assigned)) {
        return assigned.map((id) => id.toString().trim()).filter(Boolean);
      }

      if (typeof assigned === "object") {
        return Object.values(assigned).map((id) =>
          id.toString().trim()
        );
      }

      if (typeof assigned === "string") {
        return assigned
          .replace(/[\[\]'"]/g, "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
      }

      return [];
    };

    const toSeconds = (value, unit) => {
      const map = {
        years: 31536000,
        months: 2592000,
        days: 86400,
        hours: 3600,
        minutes: 60,
        seconds: 1,
      };
      return Number(value) * (map[unit] || 1);
    };

    // ================= CLIENT =================
    const [createdClient] = await Client.create(
      [{ ...client, company }],
      { session }
    );

    // ================= PROPERTY =================
    const [createdProperty] = await Property.create(
      [
        {
          ...property,
          client: createdClient._id,
        },
      ],
      { session }
    );

    // ================= TASK + SUBTASK =================
    const createdTasks = [];
    let totalEstimatedSeconds = 0;
    let totalCost = 0;

    for (const task of tasks || []) {

      const [createdTask] = await Task.create(
        [
          {
            taskName: task.taskName,
            taskCategory: task.taskCategory,
            taskSubCategory: task.taskSubCategory,
            taskDescription: task.description,
            taskPrice: 0,
            company,
            assignedBy: req.user._id,
            status: "pending",
          },
        ],
        { session }
      );

      let taskTotalPrice = 0;
      const subTaskIds = [];

      for (const sub of task.subTasks || []) {

        if (!sub.taskDuration || !sub.taskDurationUnit) {
          throw new Error("SubTask duration required");
        }

        if (sub.subtaskPrice === undefined) {
          throw new Error("SubTask price is required");
        }

        const estimatedSeconds = toSeconds(
          sub.taskDuration,
          sub.taskDurationUnit
        );

        const subPrice = Number(sub.subtaskPrice) || 0;

        const [createdSubTask] = await SubTask.create(
          [
            {
              subTaskName: sub.subTaskName,
              task: createdTask._id,
              assignedTo: normalizeAssignedTo(sub.assignedTo),
              assignedBy: req.user._id,
              company,
              estimatedDurationSeconds: estimatedSeconds,
              subtaskPrice: subPrice,
              status: "pending",
            },
          ],
          { session }
        );

        subTaskIds.push(createdSubTask._id);

        taskTotalPrice += subPrice;
        totalEstimatedSeconds += estimatedSeconds;
      }

      createdTask.subTasks = subTaskIds;
      createdTask.taskPrice = taskTotalPrice;

      await createdTask.save({ session });

      totalCost += taskTotalPrice;
      createdTasks.push(createdTask);
    }

    // ================= INVOICE + REFERENCE =================
    const invoiceSeq = await getNextSequence("invoice", session);
    const referenceSeq = await getNextSequence("reference", session);

    const invoiceNumber = formatNumber("RUNIV", invoiceSeq, 2);
    const referenceNumber = formatNumber("INV", referenceSeq, 3);

    const contractNumber = `CON-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    // ================= CONTRACT =================
    const [contract] = await Contract.create(
      [
        {
          contractNumber,
          invoiceNumber,
          referenceNumber,
          contractType,
          startDate,
          endDate,

          client: createdClient._id,
          property: createdProperty._id,
          tasks: createdTasks.map((t) => t._id),

          totalTasks: createdTasks.length,
          totalEstimatedSeconds,
          totalCost,
          billingType,
          hourlyRate,
          company,
          createdBy: req.user._id,
          emailStatus: "pending",
        },
      ],
      { session }
    );

    // ================= COMMIT =================
    await session.commitTransaction();
    session.endSession();

    // ================= EMAIL (YOUR STYLE) =================
    try {

      const emailHtml = await buildContractEmail({
        contract,
        client: createdClient,
        company: companyDetails,
        templateCode: req.body.emailTemplateCode || "invoice_v1",
        themeName: req.body.theme || "blue",
        frontendUrl: process.env.BACKEND_URL // ✅ FIXED
      });

      await sendSimpleMail({
        to: createdClient.email,
        subject: `Invoice ${contract.invoiceNumber}`, // ✅ YOUR REQUIREMENT
        html: emailHtml
      });

      contract.emailStatus = "sent";
      await contract.save();

    } catch (emailError) {
      console.error("Email send failed:", emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: "Contract created successfully",
      data: contract,
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error(err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create contract",
    });
  }
};

exports.getCompanyAdminContracts = async (req, res) => {
  try {
    const user = req.user;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access contracts",
      });
    }
    const { page = 1, limit = 10, search = "", status } = req.query;

    const skip = (page - 1) * limit;

    const filter = {
      company: user.company,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    let contracts = await Contract.find(filter)
      .populate("client", "name email city country clientLogo")
      .populate("property", "propertyName propertyType")
      .populate("company", "companyName")
      .populate("createdBy", "firstName lastName email")
      .populate({
        path: "tasks",
        select: "taskName taskTime taskPrice status",
      })
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    if (search) {
      const keyword = search.toLowerCase();
      contracts = contracts.filter(
        (c) =>
          c.contractNumber?.toLowerCase().includes(keyword) ||
          c.client?.name?.toLowerCase().includes(keyword),
      );
    }

    contracts = contracts.map((contract) => {
      if (contract.client?.clientLogo) {
        contract.client.clientLogo = getFileUrl(
          req,
          contract.client.clientLogo,
        );
      }

      if (contract.additionalDocuments?.length) {
        contract.additionalDocuments = contract.additionalDocuments.map(
          (doc) => ({
            ...doc,
            fileUrl: getFileUrl(req, doc.fileUrl),
          }),
        );
      }

      return contract;
    });

    const total = await Contract.countDocuments(filter);

    return res.status(200).json({
      success: true,
      data: contracts,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    console.error("Get company admin contracts error:", error);
    return res.status(500).json({
      message: "Failed to fetch contracts",
    });
  }
};

exports.getSingleCompanyAdminContract = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access this contract",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid contract id",
      });
    }

    const contract = await Contract.findOne({
      _id: id,
      company: user.company,
      isDeleted: false,
    })
      .populate("client", "name email phone city country clientLogo")
      .populate("property", "propertyName propertyType sizeSqm")
      .populate("company", "companyName")
      .populate("createdBy", "firstName lastName email")

      // ✅ FIXED TASK + SUBTASK STRUCTURE
      .populate({
        path: "tasks",
        select: "taskName taskCategory taskSubCategory taskDescription taskPrice status",
        populate: {
          path: "subTasks",
          populate: {
            path: "assignedTo",
            select: "firstName lastName email",
          },
        },
      })

      .lean();

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found",
      });
    }

    // ✅ FILE URL FIX
    if (contract.client?.clientLogo) {
      contract.client.clientLogo = getFileUrl(
        req,
        contract.client.clientLogo
      );
    }

    if (contract.additionalDocuments?.length) {
      contract.additionalDocuments = contract.additionalDocuments.map(
        (doc) => ({
          ...doc,
          fileUrl: getFileUrl(req, doc.fileUrl),
        })
      );
    }

    return res.status(200).json({
      success: true,
      data: contract,
    });

  } catch (error) {
    console.error("Get single contract error:", error);
    return res.status(500).json({
      message: "Failed to fetch contract",
    });
  }
};


exports.contractEmailResponse = async (req, res) => {
  try {
    const { contractId, action } = req.query;

    if (!contractId || !action) {
      return res.status(400).send("Invalid request");
    }

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).send("Invalid action");
    }

    const contract = await Contract.findById(contractId);

    if (!contract) {
      return res.status(404).send("Contract not found");
    }

    if (
      contract.emailStatus === "accepted" ||
      contract.emailStatus === "rejected"
    ) {
      return res
        .status(409)
        .send("You have already responded to this contract");
    }

    if (action === "accept") {
      contract.emailStatus = "accepted";
      contract.clinetStatus = "accepted";
      contract.status = "active";
    } else if (action === "reject") {
      contract.emailStatus = "rejected";
      contract.clinetStatus = "rejected";
      contract.status = "cancelled";
    }

    contract.emailRespondedAt = new Date();

    await contract.save();

    return res.send("Response recorded successfully");

  } catch (error) {
    console.error("Contract email response error:", error);
    return res.status(500).send("Failed to process response");
  }
};

