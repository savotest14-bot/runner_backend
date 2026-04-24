
const Company = require("../models/company");
const Group = require("../models/group");
const Task = require("../models/task");
const User = require("../models/user");
const Role = require("../models/role");
const Contract = require("../models/contract");
const SubTask = require("../models/subtask");
const mongoose = require("mongoose");
const Client = require("../models/client");
const Property = require("../models/property");
const generatePDF = require("../utils/generatePdf");
const WorkReport = require("../models/WorkReport");



exports.getEligibleUsersForGroup = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const search = req.query.search || "";
    const { taskId, contractId } = req.query; // optional context

    const employeeRole = await Role.findOne({ name: "employee" });

    // ✅ 1. Get all employees
    let employeeFilter = {
      company: req.user.company,
      role: employeeRole?._id,
      isDeleted: false,
    };

    if (search) {
      employeeFilter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const employees = await User.find(employeeFilter)
      .select("_id firstName lastName email role")
      .populate("role", "name")
      .lean();

    // ✅ 2. Get groups (context-based)
    let groupFilter = {
      company: req.user.company,
    };

    if (taskId) {
      groupFilter.task = taskId;
    }

    if (contractId) {
      groupFilter.contract = contractId;
    }

    const groups = await Group.find(groupFilter).lean();

    // ✅ 3. Find users who are already group admins in this context
    const existingGroupAdmins = new Set();

    groups.forEach(group => {
      group.members.forEach(member => {
        if (member.role === "GROUP_ADMIN") {
          existingGroupAdmins.add(member.user.toString());
        }
      });
    });

    // ✅ 4. Mark eligibility
    const result = employees.map(user => ({
      ...user,
      isAlreadyGroupAdmin: existingGroupAdmins.has(user._id.toString()),
    }));

    return res.status(200).json({
      message: "Eligible users fetched successfully",
      data: result,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to fetch users",
    });
  }
};

exports.getAvailableContracts = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const search = req.query.search || "";

    // ✅ 1. Get all contracts already assigned in groups
    const groups = await Group.find({
      company: req.user.company,
      assignmentType: "CONTRACT",
      contract: { $ne: null },
    }).select("contract");

    const assignedContractIds = groups.map(g => g.contract.toString());

    // ✅ 2. Build filter
    const filter = {
      company: req.user.company,
      isDeleted: false,
      // clinetStatus:"accepted",

      // 🔥 exclude already assigned contracts
      _id: { $nin: assignedContractIds },

      ...(search && {
        $or: [
          { contractNumber: { $regex: search, $options: "i" } },
          { invoiceNumber: { $regex: search, $options: "i" } },
          { referenceNumber: { $regex: search, $options: "i" } },
        ],
      }),
    };

    // ✅ 3. Fetch contracts
    const contracts = await Contract.find(filter)
      .populate("client", "name")
      .populate("property", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      message: "Available contracts fetched successfully",
      data: contracts,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to fetch contracts",
    });
  }
};

exports.getAvailableTasks = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const search = req.query.search || "";
    const { contractId } = req.query;

    // ✅ 1. Build contract filter
    let contractFilter = {
      company: req.user.company,
      isDeleted: false,
    };

    if (contractId) {
      // 👉 If specific contract passed
      contractFilter._id = contractId;
      // contractFilter.clinetStatus = "accepted";
    } else {
      // 👉 Otherwise only accepted contracts
      contractFilter.clinetStatus = "accepted"; // ⚠️ keep your field name
    }

    const contracts = await Contract.find(contractFilter).select("tasks");

    // ✅ 2. Extract task IDs
    const allowedTaskIds = new Set();
    contracts.forEach(c => {
      c.tasks.forEach(t => allowedTaskIds.add(t.toString()));
    });

    // ❗ Edge case: no tasks
    if (allowedTaskIds.size === 0) {
      return res.status(200).json({
        message: "No tasks available",
        data: [],
      });
    }

    // ✅ 3. Get already assigned tasks
    const groups = await Group.find({
      company: req.user.company,
      assignmentType: "TASK",
      task: { $ne: null },
    }).select("task");

    const assignedTaskIds = groups.map(g => g.task.toString());
    // ✅ 4. Build filter
    const filter = {
      company: req.user.company,
      isDeleted: false,

      _id: {
        $in: Array.from(allowedTaskIds),
        $nin: assignedTaskIds,
      },

      ...(search && {
        $or: [
          { taskName: { $regex: search, $options: "i" } },
          { taskCategory: { $regex: search, $options: "i" } },
          { taskSubCategory: { $regex: search, $options: "i" } },
        ],
      }),
    };

    // ✅ 5. Fetch tasks
    const tasks = await Task.find(filter)
      .select("taskName taskCategory taskSubCategory status taskPrice")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      message: "Available tasks fetched successfully",
      data: tasks,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to fetch tasks",
    });
  }
};

exports.suggestMembers = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const { contractId } = req.query;
    const search = req.query.search || "";

    const employeeRole = await Role.findOne({ name: "employee" });

    let priorityUserIds = new Set();

    // ✅ 1. Get priority users from contract → tasks → subtasks
    if (contractId) {
      const contract = await Contract.findOne({
        _id: contractId,
        company: req.user.company,
        isDeleted: false,
      }).populate({
        path: "tasks",
        select: "_id",
      });

      if (contract && contract.tasks.length > 0) {
        const taskIds = contract.tasks.map(t => t._id);

        const subTasks = await SubTask.find({
          task: { $in: taskIds },
        }).select("assignedTo");

        subTasks.forEach(sub => {
          sub.assignedTo.forEach(userId => {
            priorityUserIds.add(userId.toString());
          });
        });
      }
    }

    // ✅ 2. Get ALL employees (with search)
    let filter = {
      company: req.user.company,
      role: employeeRole?._id,
      isDeleted: false,
    };

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("_id firstName lastName email")
      .lean();

    // ✅ 3. Sort: priority users first
    const sortedUsers = users.sort((a, b) => {
      const aPriority = priorityUserIds.has(a._id.toString()) ? 1 : 0;
      const bPriority = priorityUserIds.has(b._id.toString()) ? 1 : 0;

      return bPriority - aPriority; // priority first
    });

    return res.status(200).json({
      message: "Members fetched successfully",
      data: sortedUsers,
    });

  } catch (error) {
    console.error("Suggest members error:", error);
    return res.status(500).json({
      message: "Failed to fetch members",
    });
  }
};

exports.createGroup = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const {
      name,
      groupAdminId,
      contractIds = [],
      taskIds = [],
      memberIds = [],
      description = "",
    } = req.body;

    // ✅ STEP 1: Basic validation
    if (!name || !groupAdminId) {
      return res.status(400).json({
        message: "Name and groupAdminId are required",
      });
    }

    if (contractIds.length === 0 && taskIds.length === 0) {
      return res.status(400).json({
        message: "Either contractIds or taskIds is required",
      });
    }

    // ✅ STEP 2: Validate Admin
    const adminUser = await User.findOne({
      _id: groupAdminId,
      company: req.user.company,
      isDeleted: false,
    });

    if (!adminUser) {
      return res.status(404).json({
        message: "Group admin not found or not in your company",
      });
    }

    // ❌ Prevent admin duplication
    if (memberIds.some(id => id.toString() === groupAdminId.toString())) {
      return res.status(400).json({
        message: "Group admin cannot be in members",
      });
    }

    // ✅ STEP 3: Validate Members
    if (memberIds.length > 0) {
      const validMembers = await User.find({
        _id: { $in: memberIds },
        company: req.user.company,
        isDeleted: false,
      }).select("_id");

      if (validMembers.length !== memberIds.length) {
        return res.status(400).json({
          message: "Some members do not belong to your company",
        });
      }
    }

    // ✅ STEP 4: Prepare members
    const members = [
      { user: groupAdminId, role: "GROUP_ADMIN" },
      ...memberIds
        .filter(id => id.toString() !== groupAdminId.toString())
        .map(id => ({ user: id, role: "EMPLOYEE" })),
    ];

    const uniqueMembers = Array.from(
      new Map(members.map(m => [m.user.toString(), m])).values()
    );

    // =========================================================
    // 🔥 STEP 5: Determine FINAL TASK IDS
    // =========================================================

    let finalTaskIds = [];

    // ✅ CASE 1: Only contractIds → take ALL tasks of contracts
    if (contractIds.length > 0 && taskIds.length === 0) {
      const contracts = await Contract.find({
        _id: { $in: contractIds },
        company: req.user.company,
      }).select("tasks");

      finalTaskIds = contracts.flatMap(c => c.tasks.map(t => t.toString()));
    }

    // ✅ CASE 2: contractIds + taskIds → only given tasks
    else if (contractIds.length > 0 && taskIds.length > 0) {
      const contracts = await Contract.find({
        _id: { $in: contractIds },
        company: req.user.company,
      }).select("tasks");

      const allowedTaskIds = new Set(
        contracts.flatMap(c => c.tasks.map(t => t.toString()))
      );

      const invalidTasks = taskIds.filter(
        id => !allowedTaskIds.has(id.toString())
      );

      if (invalidTasks.length > 0) {
        return res.status(400).json({
          message: "Some tasks do not belong to provided contracts",
        });
      }

      finalTaskIds = taskIds;
    }

    // ✅ CASE 3: Only taskIds
    else {
      finalTaskIds = taskIds;
    }

    // ❗ Remove duplicates
    finalTaskIds = [...new Set(finalTaskIds.map(id => id.toString()))];

    // =========================================================
    // 🔥 STEP 6: Prevent duplicate group assignment
    // =========================================================

    const existing = await Group.find({
      company: req.user.company,
      assignmentType: "TASK",
      task: { $in: finalTaskIds },
    }).select("task");

    const existingTaskIds = new Set(
      existing.map(g => g.task.toString())
    );

    const duplicateTasks = finalTaskIds.filter(id =>
      existingTaskIds.has(id)
    );

    if (duplicateTasks.length > 0) {
      return res.status(400).json({
        message: "Some tasks already have groups",
        duplicateTasks,
      });
    }

    // =========================================================
    // 🔥 STEP 7: Create Groups (PER TASK)
    // =========================================================

    const createdGroups = [];

    for (const taskId of finalTaskIds) {
      const group = await Group.create({
        name,
        company: req.user.company,
        assignmentType: "TASK",
        task: taskId,
        members: uniqueMembers,
        description,
        createdBy: req.user._id,
      });

      createdGroups.push(group);
    }

    return res.status(201).json({
      message: "Groups created successfully",
      data: createdGroups,
    });

  } catch (error) {
    console.error("Create group error:", error);
    return res.status(500).json({
      message: "Failed to create group",
    });
  }
};


exports.getAllGroups = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    // ======================================================
    // ✅ FILTER
    // ======================================================
    const filter = {
      company: req.user.company,
      isDeleted: false,

      ...(search && {
        name: { $regex: search, $options: "i" },
      }),
    };

    // ======================================================
    // ✅ FETCH DATA
    // ======================================================
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .populate("task", "taskName taskCategory status taskPrice")
        .populate("members.user", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Group.countDocuments(filter),
    ]);

    // ======================================================
    // ✅ FORMAT RESPONSE
    // ======================================================
    const formattedGroups = groups.map(group => {
      const admin = group.members.find(m => m.role === "GROUP_ADMIN");

      return {
        _id: group._id,
        name: group.name,
        description: group.description,

        assignmentType: group.assignmentType,
        task: group.task || null,

        groupAdmin: admin
          ? {
            _id: admin.user._id,
            firstName: admin.user.firstName,
            lastName: admin.user.lastName,
            email: admin.user.email,
          }
          : null,

        totalMembers: group.members.length,

        createdAt: group.createdAt,
      };
    });

    return res.status(200).json({
      message: "Groups fetched successfully",
      data: formattedGroups,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error("Get groups error:", error);
    return res.status(500).json({
      message: "Failed to fetch groups",
    });
  }
};

exports.getGroupDetails = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: "Invalid groupId",
      });
    }

    // ======================================================
    // ✅ STEP 1: Get Group
    // ======================================================
    const group = await Group.findOne({
      _id: groupId,
      company: req.user.company,
      isDeleted: false,
    })
      .populate("task", "taskName taskCategory status taskPrice")
      .populate("members.user", "firstName lastName email")
      .lean();

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // ======================================================
    // ✅ STEP 2: Extract Admin
    // ======================================================
    const admin = group.members.find(m => m.role === "GROUP_ADMIN");

    // ======================================================
    // ✅ STEP 3: Get Contract (IMPORTANT PART)
    // ======================================================
    let contract = null;

    if (group.task?._id) {
      const foundContract = await Contract.findOne({
        tasks: group.task._id,
      })
        .populate("client", "name")
        .populate("property", "name")
        .select("contractNumber status totalCost client property")
        .lean();

      if (foundContract) {
        contract = {
          _id: foundContract._id,
          contractNumber: foundContract.contractNumber,
          status: foundContract.status,
          totalCost: foundContract.totalCost,
          clientName: foundContract.client?.name || "-",
          propertyName: foundContract.property?.name || "-",
        };
      }
    }

    // ======================================================
    // ✅ STEP 4: Get Subtasks
    // ======================================================
    let subTasks = [];

    if (group.task?._id) {
      subTasks = await SubTask.find({
        task: group.task._id,
      })
        .select("subTaskName status assignedTo")
        .populate("assignedTo", "firstName lastName")
        .lean();
    }

    // ======================================================
    // ✅ STEP 5: Format Members
    // ======================================================
    const members = group.members.map(m => ({
      _id: m.user._id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      role: m.role,
    }));

    // ======================================================
    // ✅ FINAL RESPONSE
    // ======================================================
    const response = {
      _id: group._id,
      name: group.name,
      description: group.description || "",

      task: group.task || null,
      contract: contract, // 🔥 added

      groupAdmin: admin
        ? {
          _id: admin.user._id,
          firstName: admin.user.firstName,
          lastName: admin.user.lastName,
          email: admin.user.email,
        }
        : null,

      totalMembers: group.members.length,
      members,

      subTasks, // 🔥 already included
    };

    return res.status(200).json({
      message: "Group details fetched successfully",
      data: response,
    });

  } catch (error) {
    console.error("Get group details error:", error);
    return res.status(500).json({
      message: "Failed to fetch group details",
    });
  }
};



exports.updateGroup = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const { groupId } = req.params;
    const { name, groupAdminId, memberIds = [], description } = req.body;

    // ✅ Validate groupId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid groupId" });
    }

    // ✅ Find group
    const group = await Group.findOne({
      _id: groupId,
      isDeleted: false,
      company: req.user.company,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // ======================================================
    // ✅ VALIDATE GROUP ADMIN
    // ======================================================
    if (groupAdminId) {
      if (!mongoose.Types.ObjectId.isValid(groupAdminId)) {
        return res.status(400).json({
          message: "Invalid groupAdminId",
        });
      }

      const adminUser = await User.findOne({
        _id: groupAdminId,
        company: req.user.company,
        isDeleted: false,
      });

      if (!adminUser) {
        return res.status(404).json({
          message: "Group admin not found in your company",
        });
      }

      // ❌ Prevent admin in members
      if (memberIds.some(id => id.toString() === groupAdminId.toString())) {
        return res.status(400).json({
          message: "Group admin cannot be in members",
        });
      }
    }

    // ======================================================
    // ✅ VALIDATE MEMBERS
    // ======================================================
    if (memberIds.length > 0) {
      const validMembers = await User.find({
        _id: { $in: memberIds },
        company: req.user.company,
        isDeleted: false,
      }).select("_id");

      if (validMembers.length !== memberIds.length) {
        return res.status(400).json({
          message: "Some members are invalid",
        });
      }
    }

    // ======================================================
    // ✅ UPDATE BASIC FIELDS
    // ======================================================
    if (name) group.name = name;
    if (description !== undefined) group.description = description;

    // ======================================================
    // ✅ UPDATE MEMBERS + ADMIN (CORE LOGIC)
    // ======================================================
    if (groupAdminId || memberIds.length > 0) {
      const finalAdminId =
        groupAdminId || group.members.find(m => m.role === "GROUP_ADMIN")?.user;

      // Build members
      const members = [
        {
          user: finalAdminId,
          role: "GROUP_ADMIN",
        },
        ...memberIds
          .filter(id => id.toString() !== finalAdminId.toString())
          .map(id => ({
            user: id,
            role: "EMPLOYEE",
          })),
      ];

      // remove duplicates
      const uniqueMembers = Array.from(
        new Map(members.map(m => [m.user.toString(), m])).values()
      );

      group.members = uniqueMembers;
    }

    await group.save();

    return res.status(200).json({
      message: "Group updated successfully",
      data: group,
    });

  } catch (error) {
    console.error("Update group error:", error);
    return res.status(500).json({
      message: "Update failed",
    });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    // ✅ Role check
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const { groupId } = req.params;

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: "Invalid groupId",
      });
    }

    // ✅ Find group (company scoped)
    const group = await Group.findOne({
      _id: groupId,
      isDeleted: false,
      company: req.user.company,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // ======================================================
    // ✅ SOFT DELETE (Recommended)
    // ======================================================
    group.isDeleted = true;
    await group.save();

    // ======================================================
    // ❗ OPTIONAL: HARD DELETE (if you prefer)
    // await Group.findByIdAndDelete(groupId);
    // ======================================================

    return res.status(200).json({
      message: "Group deleted successfully",
    });

  } catch (error) {
    console.error("Delete group error:", error);
    return res.status(500).json({
      message: "Delete failed",
    });
  }
};

exports.changeGroupAdmin = async (req, res) => {
  try {
    if (req.user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company_admin can access this route",
      });
    }

    const { groupId } = req.params;
    const { newAdminId } = req.body;

    // ✅ Validate input
    if (!newAdminId) {
      return res.status(400).json({
        message: "newAdminId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Invalid groupId" });
    }

    if (!mongoose.Types.ObjectId.isValid(newAdminId)) {
      return res.status(400).json({ message: "Invalid newAdminId" });
    }

    // ✅ Find group
    const group = await Group.findOne({
      _id: groupId,
      isDeleted: false,
      company: req.user.company,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // ✅ Validate new admin user
    const newAdmin = await User.findOne({
      _id: newAdminId,
      company: req.user.company,
      isDeleted: false,
    });

    if (!newAdmin) {
      return res.status(404).json({
        message: "New admin not found in your company",
      });
    }

    // ======================================================
    // 🔥 CORE LOGIC
    // ======================================================

    // 🔹 Remove old admin
    const existingMembers = group.members.filter(
      m => m.role !== "GROUP_ADMIN"
    );

    // 🔹 Remove new admin if already exists in members
    const filteredMembers = existingMembers.filter(
      m => m.user.toString() !== newAdminId.toString()
    );

    // 🔹 Add new admin at top
    const updatedMembers = [
      {
        user: newAdminId,
        role: "GROUP_ADMIN",
      },
      ...filteredMembers,
    ];

    group.members = updatedMembers;

    await group.save();

    return res.status(200).json({
      message: "Group admin updated successfully",
      data: group,
    });

  } catch (error) {
    console.error("Change admin error:", error);
    return res.status(500).json({
      message: "Failed to update group admin",
    });
  }
};


exports.addGroupMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body; // 👈 this is array

    // ======================================================
    // ✅ STEP 1: Validate groupId
    // ======================================================
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: "Invalid groupId",
      });
    }

    // ======================================================
    // ✅ STEP 2: Validate userId array
    // ======================================================
    if (!Array.isArray(userId) || userId.length === 0) {
      return res.status(400).json({
        message: "userId must be a non-empty array",
      });
    }

    // ======================================================
    // ✅ STEP 3: Validate ObjectIds
    // ======================================================
    const invalidIds = userId.filter(
      id => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: "Invalid userIds",
        invalidIds,
      });
    }

    // ======================================================
    // ✅ STEP 4: Get group
    // ======================================================
    const group = await Group.findOne({
      _id: groupId,
      company: req.user.company,
      isDeleted: false,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // ======================================================
    // ✅ STEP 5: Existing users in group
    // ======================================================
    const existingUserIds = new Set(
      group.members.map(m => m.user.toString())
    );

    // 👉 Remove already existing users
    let newUsers = userId.filter(
      id => !existingUserIds.has(id.toString())
    );

    if (newUsers.length === 0) {
      return res.status(400).json({
        message: "All users already exist in group",
      });
    }

    // ======================================================
    // ✅ STEP 6: Prevent adding group admin
    // ======================================================
    const admin = group.members.find(m => m.role === "GROUP_ADMIN");

    if (admin) {
      newUsers = newUsers.filter(
        id => id.toString() !== admin.user.toString()
      );
    }

    if (newUsers.length === 0) {
      return res.status(400).json({
        message: "Cannot add group admin as member",
      });
    }

    // ======================================================
    // ✅ STEP 7: Validate users (same company)
    // ======================================================
    const validUsers = await User.find({
      _id: { $in: newUsers },
      company: req.user.company,
      isDeleted: false,
    }).select("_id");

    if (validUsers.length !== newUsers.length) {
      return res.status(400).json({
        message: "Some users are invalid or not in your company",
      });
    }

    // ======================================================
    // ✅ STEP 8: Add members
    // ======================================================
    const membersToAdd = newUsers.map(id => ({
      user: id,
      role: "EMPLOYEE",
    }));

    group.members.push(...membersToAdd);

    await group.save();

    return res.status(200).json({
      message: "Members added successfully",
      addedCount: membersToAdd.length,
      data: group,
    });

  } catch (error) {
    console.error("Add member error:", error);
    return res.status(500).json({
      message: "Failed to add members",
    });
  }
};


exports.removeGroupMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body; // 👈 array expected

    // ======================================================
    // ✅ STEP 1: Validate groupId
    // ======================================================
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: "Invalid groupId",
      });
    }

    // ======================================================
    // ✅ STEP 2: Validate userId array
    // ======================================================
    if (!Array.isArray(userId) || userId.length === 0) {
      return res.status(400).json({
        message: "userId must be a non-empty array",
      });
    }

    // ======================================================
    // ✅ STEP 3: Validate ObjectIds
    // ======================================================
    const invalidIds = userId.filter(
      id => !mongoose.Types.ObjectId.isValid(id)
    );

    if (invalidIds.length > 0) {
      return res.status(400).json({
        message: "Invalid userIds",
        invalidIds,
      });
    }

    // ======================================================
    // ✅ STEP 4: Get group (company safe)
    // ======================================================
    const group = await Group.findOne({
      _id: groupId,
      company: req.user.company,
      isDeleted: false,
    });

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // ======================================================
    // ✅ STEP 5: Existing members
    // ======================================================
    const existingUserIds = new Set(
      group.members.map(m => m.user.toString())
    );

    // 👉 Only users that exist in group
    let usersToRemove = userId.filter(id =>
      existingUserIds.has(id.toString())
    );

    if (usersToRemove.length === 0) {
      return res.status(400).json({
        message: "No valid users found in group",
      });
    }

    // ======================================================
    // ✅ STEP 6: Prevent removing GROUP_ADMIN
    // ======================================================
    const admin = group.members.find(m => m.role === "GROUP_ADMIN");

    if (admin) {
      const adminId = admin.user.toString();

      if (usersToRemove.includes(adminId)) {
        return res.status(400).json({
          message: "Cannot remove group admin",
        });
      }
    }

    // ======================================================
    // ✅ STEP 7: Remove members
    // ======================================================
    group.members = group.members.filter(
      m => !usersToRemove.includes(m.user.toString())
    );

    await group.save();

    return res.status(200).json({
      message: "Members removed successfully",
      removedCount: usersToRemove.length,
      data: group,
    });

  } catch (error) {
    console.error("Remove member error:", error);
    return res.status(500).json({
      message: "Failed to remove members",
    });
  }
};


exports.getMyGroups = async (req, res) => {
  try {
    // ✅ Convert userId to ObjectId (CRITICAL FIX)
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    // ======================================================
    // ✅ FILTER (based on members.role)
    // ======================================================
    const filter = {
      company: req.user.company,
      isDeleted: false,
      members: {
        $elemMatch: {
          user: userId,
          role: "GROUP_ADMIN",
        },
      },

      ...(search && {
        name: { $regex: search, $options: "i" },
      }),
    };

    // ======================================================
    // ✅ FETCH DATA
    // ======================================================
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .populate("task", "taskName taskCategory status taskPrice")
        .populate("members.user", "firstName lastName email") // optional but useful
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Group.countDocuments(filter),
    ]);

    // ======================================================
    // ✅ FORMAT RESPONSE
    // ======================================================
    const formattedGroups = groups.map(group => {
      const admin = group.members.find(m => m.role === "GROUP_ADMIN");

      return {
        _id: group._id,
        name: group.name,
        description: group.description,

        task: group.task || null,

        groupAdmin: admin ? {
          _id: admin.user._id,
          firstName: admin.user.firstName,
          lastName: admin.user.lastName,
          email: admin.user.email,
        } : null,

        totalMembers: group.members.length,

        createdAt: group.createdAt,
      };
    });

    return res.status(200).json({
      message: "My groups fetched successfully",
      data: formattedGroups,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    console.error("Get my groups error:", error);
    return res.status(500).json({
      message: "Failed to fetch groups",
    });
  }
};

exports.getGroupFullDetails = async (req, res) => {
  try {
    // ❌ Don't rely on role.name anymore
    // ✅ Allow access if user is GROUP_ADMIN in this group

    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: "Invalid groupId",
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user._id);

    // ======================================================
    // ✅ STEP 1: Get Group (with membership check)
    // ======================================================
    const group = await Group.findOne({
      _id: groupId,
      company: req.user.company,
      isDeleted: false,
      members: {
        $elemMatch: {
          user: userId,
          role: "GROUP_ADMIN",
        },
      },
    })
      .populate("task", "taskName taskCategory status taskPrice")
      .populate("members.user", "firstName lastName email phone")
      .lean();

    if (!group) {
      return res.status(404).json({
        message: "Group not found or access denied",
      });
    }

    // ======================================================
    // ✅ STEP 2: Extract Admin
    // ======================================================
    const admin = group.members.find(m => m.role === "GROUP_ADMIN");

    // ======================================================
    // ✅ STEP 3: Get Contract from Task
    // ======================================================
    let contract = null;

    if (group.task?._id) {
      const foundContract = await Contract.findOne({
        tasks: group.task._id,
      })
        .populate("client", "name")
        .populate("property", "name")
        .select("contractNumber status totalCost client property")
        .lean();

      if (foundContract) {
        contract = {
          _id: foundContract._id,
          contractNumber: foundContract.contractNumber,
          status: foundContract.status,
          totalCost: foundContract.totalCost,
          clientName: foundContract.client?.name || "-",
          propertyName: foundContract.property?.name || "-",
        };
      }
    }

    // ======================================================
    // ✅ STEP 4: Get Subtasks (MAIN DATA)
    // ======================================================
    let subTasks = [];

    if (group.task?._id) {
      subTasks = await SubTask.find({
        task: group.task._id,
      })
        .select("subTaskName status assignedTo")
        .populate("assignedTo", "firstName lastName email")
        .lean();
    }

    // ======================================================
    // ✅ STEP 5: Format Members
    // ======================================================
    const members = group.members.map(m => ({
      _id: m.user._id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      phone: m.user.phone,
      role: m.role,
    }));

    // ======================================================
    // ✅ STEP 6: Format Subtasks
    // ======================================================
    const formattedSubTasks = subTasks.map(sub => ({
      _id: sub._id,
      subTaskName: sub.subTaskName,
      status: sub.status,

      assignedTo: sub.assignedTo.map(u => ({
        _id: u._id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
      })),
    }));

    // ======================================================
    // ✅ FINAL RESPONSE
    // ======================================================
    const response = {
      _id: group._id,
      name: group.name,
      description: group.description,

      task: group.task,
      contract,

      groupAdmin: admin
        ? {
          _id: admin.user._id,
          firstName: admin.user.firstName,
          lastName: admin.user.lastName,
          email: admin.user.email,
          phone: admin.user.phone,
        }
        : null,

      totalMembers: group.members.length,
      members,

      totalSubTasks: formattedSubTasks.length,
      subTasks: formattedSubTasks,

      createdAt: group.createdAt,
    };

    return res.status(200).json({
      message: "Group full details fetched successfully",
      data: response,
    });

  } catch (error) {
    console.error("Get full group error:", error);
    return res.status(500).json({
      message: "Failed to fetch group details",
    });
  }
};

exports.getGroupAdminDashboard = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);
    const companyId = new mongoose.Types.ObjectId(req.user.company);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // ================= GROUP TASK IDS =================
    const groups = await Group.find({
      company: companyId,
      isDeleted: false,
      members: {
        $elemMatch: {
          user: userId,
          role: "GROUP_ADMIN",
        },
      },
    }).select("task");

    const taskIds = groups.map(g => g.task).filter(Boolean);

    // ================= TODAY WORK =================
    const todayWork = await SubTask.countDocuments({
      task: { $in: taskIds },
      createdAt: { $gte: todayStart, $lte: todayEnd },
    });

    // ================= ACTIVE TASKS =================
    const activeTasks = await SubTask.countDocuments({
      task: { $in: taskIds },
      status: "in_progress",
      timerStartedAt: { $ne: null },
    });

    // ================= OVERDUE TASKS =================
    const overdueTasks = await SubTask.countDocuments({
      task: { $in: taskIds },
      status: { $ne: "completed" },
      expectedEndTime: { $ne: null, $lt: new Date() },
    });

    // ================= WORK REPORT STATS =================
    const reportStats = await WorkReport.aggregate([
      {
        $match: {
          task: { $in: taskIds },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalTime: { $sum: "$totalTimeSeconds" },
        },
      },
    ]);

    let approvedReports = 0;
    let pendingReports = 0;
    let totalWorkTime = 0;

    reportStats.forEach((r) => {
      if (r._id === "approved") {
        approvedReports = r.count;
        totalWorkTime += r.totalTime;
      }
      if (r._id === "pending") {
        pendingReports = r.count;
      }
    });

    // ================= TEAM SIZE =================
    const teamAgg = await SubTask.aggregate([
      {
        $match: {
          task: { $in: taskIds },
        },
      },
      { $unwind: "$assignedTo" },
      {
        $group: {
          _id: "$assignedTo",
        },
      },
    ]);

    const teamSize = teamAgg.length;

    // ================= RESPONSE =================
    return res.status(200).json({
      success: true,
      data: {
        todayWork,
        activeTasks,
        overdueTasks,
        workReports: {
          approved: approvedReports,
          pending: pendingReports,
        },
        teamSize,
        totalWorkHours: Number((totalWorkTime / 3600).toFixed(2)),
      },
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).json({
      message: "Failed to fetch dashboard stats",
    });
  }
};

exports.getGroupMembersForAssign = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role.name; // 👈 important
    const { groupId } = req.params;
    const search = req.query.search?.toLowerCase() || "";

    let group;

    // ✅ CASE 1: COMPANY ADMIN
    if (userRole === "company_admin") {
      group = await Group.findOne({
        _id: groupId,
        isDeleted: false,
      })
        .populate("members.user", "firstName lastName email")
        .select("name members");

      if (!group) {
        return res.status(404).json({
          message: "Group not found",
        });
      }
    }

    // ✅ CASE 2: GROUP ADMIN
    else {
      group = await Group.findOne({
        _id: groupId,
        // isDeleted: false,
        members: {
          $elemMatch: {
            user: userId,
            role: "GROUP_ADMIN",
          },
        },
      })
        .populate("members.user", "firstName lastName email")
        .select("name members");

      if (!group) {
        return res.status(404).json({
          message: "Group not found or you are not admin",
        });
      }
    }

    // ✅ FILTER LOGIC
    const filteredMembers = group.members
      .filter((member) => {
        const firstName = member.user?.firstName?.toLowerCase() || "";
        const lastName = member.user?.lastName?.toLowerCase() || "";
        const email = member.user?.email?.toLowerCase() || "";

        const fullName = `${firstName} ${lastName}`.trim();

        // 🔥 COMPANY ADMIN → exclude GROUP_ADMIN
        if (userRole === "COMPANY_ADMIN") {
          return (
            member.role !== "GROUP_ADMIN" &&
            member.user &&
            (fullName.includes(search) || email.includes(search))
          );
        }

        // 🔥 GROUP ADMIN → only employees & exclude himself
        return (
          member.role === "EMPLOYEE" &&
          member.user &&
          member.user._id.toString() !== userId.toString() &&
          (fullName.includes(search) || email.includes(search))
        );
      })
      .map((member) => {
        const firstName = member.user?.firstName || "";
        const lastName = member.user?.lastName || "";

        const fullName = `${firstName} ${lastName}`.trim();

        return {
          _id: member.user._id,
          name: fullName || member.user.email,
          email: member.user.email || "",
          role: member.role,
        };
      });

    // ✅ RESPONSE
    return res.status(200).json({
      message: "Group members fetched successfully",
      data: {
        groupId: group._id,
        groupName: group.name,
        totalMembers: filteredMembers.length,
        members: filteredMembers,
      },
    });
  } catch (error) {
    console.error("Error fetching group members:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

exports.reviewWorkReport = async (req, res) => {
  const { reportId } = req.params;

  const report = await WorkReport.findById(reportId);

  if (!report) {
    return res.status(404).json({ message: "Report not found" });
  }

  report.reviewStatus = "reviewed";
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();

  await report.save();

  res.json({
    success: true,
    message: "Report reviewed by Group Admin",
  });
};