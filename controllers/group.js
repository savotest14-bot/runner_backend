
const Company = require("../models/company");
const Group = require("../models/group");
const Task = require("../models/task");
const User = require("../models/user");
const Role = require("../models/role");
const Contract = require("../models/contract");


exports.getEligibleUsersForGroup = async (req, res) => {
  try {
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const search = req.query.search || "";

    const employeeRole = await Role.findOne({ name: "employee" });
    const groupAdminRole = await Role.findOne({ name: "group_admin" });

    // 🔹 All employees
    const allEmployees = await User.find({
      company: req.user.company,
      role: employeeRole?._id,
      isDeleted: false,
    }).select("_id");

    const tasks = await Task.find({
      company: req.user.company,
      isDeleted: false,
    }).select("assignedTo groupAdmin");

    const employeesWithTasks = new Set();
    const employeeWithoutGroupAdmin = new Set();

    tasks.forEach(task => {
      task.assignedTo.forEach(userId => {
        const id = userId.toString();

        employeesWithTasks.add(id);

        if (!task.groupAdmin) {
          employeeWithoutGroupAdmin.add(id);
        }
      });
    });

    // 🔹 Employees with NO tasks
    const employeesWithNoTasks = allEmployees
      .map(e => e._id.toString())
      .filter(id => !employeesWithTasks.has(id));

    // 🔹 FINAL LIST
    const finalEmployeeIds = [
      ...new Set([
        ...employeeWithoutGroupAdmin,
        ...employeesWithNoTasks,
      ]),
    ];

    const filter = {
      company: req.user.company,
      isDeleted: false,

      $and: [
        {
          $or: [
            ...(finalEmployeeIds.length
              ? [
                {
                  _id: { $in: finalEmployeeIds },
                  role: employeeRole?._id,
                },
              ]
              : []),
            {
              role: groupAdminRole?._id,
            },
          ],
        },

        ...(search
          ? [
            {
              $or: [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
              ],
            },
          ]
          : []),
      ],
    };

    const users = await User.find(filter)
      .select("firstName lastName email role")
      .populate("role", "name")
      .lean();

    return res.status(200).json({
      message: "Eligible users fetched successfully",
      data: users,
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
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const search = req.query.search || "";

    const filter = {
      company: req.user.company,
      isDeleted: false,

      // ✅ Only contracts NOT assigned to any group
      group: null,

      ...(search && {
        $or: [
          { contractNumber: { $regex: search, $options: "i" } },
          { invoiceNumber: { $regex: search, $options: "i" } },
          { referenceNumber: { $regex: search, $options: "i" } },
        ],
      }),
    };

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

exports.createGroup = async (req, res) => {
  try {
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const {
      name,
      groupAdminId,
      contractIds = [],
      description = "",
    } = req.body;

    // 🔹 STEP 1: Basic validation
    if (!name || !groupAdminId || contractIds.length === 0) {
      return res.status(400).json({
        message: "Name, groupAdminId and contractIds are required",
      });
    }

    // 🔹 STEP 2: Get roles
    const employeeRole = await Role.findOne({ name: "employee" });
    const groupAdminRole = await Role.findOne({ name: "group_admin" });

    if (!groupAdminRole) {
      return res.status(400).json({
        message: "Group admin role not found",
      });
    }

    // 🔹 STEP 3: Validate group admin user
    const user = await User.findById(groupAdminId);

    if (!user) {
      return res.status(404).json({
        message: "Group admin user not found",
      });
    }

    // 🔹 STEP 4: Prevent already assigned contracts
    const alreadyAssigned = await Contract.find({
      _id: { $in: contractIds },
      group: { $ne: null },
    });

    if (alreadyAssigned.length > 0) {
      return res.status(400).json({
        message: "Some contracts are already assigned to another group",
      });
    }

    // 🔹 STEP 5: Convert employee → group_admin
    if (
      employeeRole &&
      user.role.toString() === employeeRole._id.toString()
    ) {
      user.role = groupAdminRole._id;
      await user.save();
    }

    // 🔹 STEP 6: Get tasks from contracts
    const contracts = await Contract.find({
      _id: { $in: contractIds },
      company: req.user.company,
    }).select("tasks");

    const taskIds = contracts.flatMap(c => c.tasks);

    const tasks = await Task.find({
      _id: { $in: taskIds },
      isDeleted: false,
    }).select("assignedTo groupAdmin");

    // 🔹 STEP 7: Extract members (unique users)
    const memberSet = new Set();

    tasks.forEach(task => {
      task.assignedTo.forEach(userId => {
        memberSet.add(userId.toString());
      });
    });

    // ❌ Remove groupAdmin from members
    memberSet.delete(groupAdminId);

    const memberIds = [...memberSet];

    // 🔹 STEP 8: Create group
    const group = await Group.create({
      name,
      groupAdmin: groupAdminId,
      members: memberIds,
      contracts: contractIds,
      company: req.user.company,
      description,
    });

    // 🔹 STEP 9: Assign group to contracts
    await Contract.updateMany(
      { _id: { $in: contractIds } },
      { group: group._id }
    );

    // 🔹 STEP 10: HANDLE TASK UPDATES (🔥 IMPORTANT LOGIC)

    if (taskIds.length > 0) {
      // 🔸 10.1 Remove existing groupAdmins from assignedTo
      const tasksWithGA = await Task.find({
        _id: { $in: taskIds },
        groupAdmin: { $ne: null },
      }).select("groupAdmin");

      const existingGroupAdmins = tasksWithGA
        .map(t => t.groupAdmin?.toString())
        .filter(Boolean);

      if (existingGroupAdmins.length > 0) {
        await Task.updateMany(
          { _id: { $in: taskIds } },
          {
            $pull: { assignedTo: { $in: existingGroupAdmins } },
          }
        );
      }

      // 🔸 10.2 Set new groupAdmin + remove from assignedTo
      await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          groupAdmin: groupAdminId,
          $pull: { assignedTo: groupAdminId },
        }
      );
    }

    return res.status(201).json({
      message: "Group created successfully",
      data: group,
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
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    // 🔹 STEP 1: Build filter
    const filter = {
      company: req.user.company,
      isDeleted: false,

      ...(search && {
        name: { $regex: search, $options: "i" },
      }),
    };

    // 🔹 STEP 2: Fetch groups
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .populate("groupAdmin", "firstName lastName email")
        .populate("contracts", "contractNumber status totalCost")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Group.countDocuments(filter),
    ]);

    // 🔹 STEP 3: Add totalMembers
    const formattedGroups = groups.map(group => ({
      ...group,
      totalMembers: group.members ? group.members.length : 0,
      members: undefined, // ❌ remove members array
    }));

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
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const { groupId } = req.params;

    // 🔹 STEP 1: Get group with contracts
    const group = await Group.findOne({
      _id: groupId,
      company: req.user.company,
      isDeleted: false,
    })
      .populate("groupAdmin", "firstName lastName")
      .populate({
        path: "contracts",
        select: "tasks client property status",
        populate: [
          { path: "client", select: "name" },
          { path: "property", select: "name" },
        ],
      })
      .lean();

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // 🔹 STEP 2: Format contract list for table
    const tableData = group.contracts.map(contract => ({
      contractId: contract._id,
      propertyName: contract.property?.name || "-",
      clientName: contract.client?.name || "-",
      totalTasks: contract.tasks ? contract.tasks.length : 0,
      status: contract.status, // active / pending / etc
    }));

    // 🔹 STEP 3: Final response
    const response = {
      groupName: group.name,
      groupLeaderName: `${group.groupAdmin?.firstName || ""} ${group.groupAdmin?.lastName || ""}`,
      description: group.description || "",
      totalMembers: group.members?.length || 0,
      contracts: tableData,
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


const ensureGroupAdminRole = async (userId) => {
  const user = await User.findById(userId);

  if (!user) throw new Error("User not found");

  const employeeRole = await Role.findOne({ name: "employee" });
  const groupAdminRole = await Role.findOne({ name: "group_admin" });

  if (
    employeeRole &&
    groupAdminRole &&
    user.role.toString() === employeeRole._id.toString()
  ) {
    user.role = groupAdminRole._id;
    await user.save();
  }

  return user;
};

exports.updateGroup = async (req, res) => {
  try {
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const { groupId } = req.params;
    const { name, groupAdminId, contractIds = [], description } = req.body;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const oldAdminId = group.groupAdmin?.toString();
    const isAdminChanged =
      groupAdminId && oldAdminId !== groupAdminId;

    // 🔹 OLD DATA
    const oldContractIds = group.contracts.map(id => id.toString());
    const newContractIds = contractIds.map(id => id.toString());

    const addedContracts = newContractIds.filter(id => !oldContractIds.includes(id));
    const removedContracts = oldContractIds.filter(id => !newContractIds.includes(id));

    // 🔹 UPDATE BASIC INFO
    group.name = name || group.name;
    group.description = description || group.description;
    group.contracts = contractIds;

    if (groupAdminId) {
      group.groupAdmin = groupAdminId;
      await ensureGroupAdminRole(groupAdminId);
      // ✅ remove new admin from members
      group.members = group.members.filter(
        m => m.toString() !== groupAdminId
      );
    }

    await group.save();

    // =========================
    // 🔥 HANDLE ADDED CONTRACTS
    // =========================
    if (addedContracts.length > 0) {
      const contracts = await Contract.find({ _id: { $in: addedContracts } }).select("tasks");

      const taskIds = contracts.flatMap(c => c.tasks);

      await Contract.updateMany(
        { _id: { $in: addedContracts } },
        { group: group._id }
      );

      await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          groupAdmin: group.groupAdmin,
          $pull: { assignedTo: group.groupAdmin },
        }
      );
    }

    // =========================
    // 🔥 HANDLE REMOVED CONTRACTS
    // =========================
    if (removedContracts.length > 0) {
      const contracts = await Contract.find({ _id: { $in: removedContracts } }).select("tasks");

      const taskIds = contracts.flatMap(c => c.tasks);

      await Contract.updateMany(
        { _id: { $in: removedContracts } },
        { group: null }
      );

      await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          groupAdmin: null,
        }
      );
    }

    // =========================
    // 🔥 HANDLE ADMIN CHANGE (NEW PART)
    // =========================
    if (isAdminChanged) {
      const contracts = await Contract.find({
        _id: { $in: group.contracts },
      }).select("tasks");

      const taskIds = contracts.flatMap(c => c.tasks);

      if (taskIds.length > 0) {
        // remove old admin from assignedTo
        await Task.updateMany(
          { _id: { $in: taskIds } },
          {
            $pull: { assignedTo: oldAdminId },
          }
        );

        // assign new admin + remove from assignedTo
        await Task.updateMany(
          { _id: { $in: taskIds } },
          {
            groupAdmin: group.groupAdmin,
            $pull: { assignedTo: group.groupAdmin },
          }
        );
      }

      // 🔹 revert old admin role if not used elsewhere
      const existsElsewhere = await Group.findOne({
        groupAdmin: oldAdminId,
        _id: { $ne: groupId },
        isDeleted: false,
      });

      if (!existsElsewhere) {
        const employeeRole = await Role.findOne({ name: "employee" });

        await User.findByIdAndUpdate(oldAdminId, {
          role: employeeRole._id,
        });
      }
    }

    // =========================
    // 🔥 RECALCULATE MEMBERS
    // =========================
    const allContracts = await Contract.find({ _id: { $in: contractIds } }).select("tasks");

    const allTaskIds = allContracts.flatMap(c => c.tasks);

    const tasks = await Task.find({ _id: { $in: allTaskIds } }).select("assignedTo");

    const memberSet = new Set();

    tasks.forEach(task => {
      task.assignedTo.forEach(u => memberSet.add(u.toString()));
    });

    // ❌ remove group admin
    memberSet.delete(group.groupAdmin.toString());

    group.members = [...memberSet];
    await group.save();

    return res.json({
      message: "Group updated successfully",
      data: group,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed" });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const contracts = await Contract.find({
      _id: { $in: group.contracts },
    }).select("tasks");

    const taskIds = contracts.flatMap(c => c.tasks);

    // 🔹 Reset contracts
    await Contract.updateMany(
      { _id: { $in: group.contracts } },
      { group: null }
    );

    // 🔹 Reset tasks
    await Task.updateMany(
      { _id: { $in: taskIds } },
      { groupAdmin: null }
    );

    // 🔹 Soft delete group
    group.isDeleted = true;
    await group.save();

    return res.json({
      message: "Group deleted successfully",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
};

exports.changeGroupAdmin = async (req, res) => {
  try {
     if (!["company_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only company_admin can  access this route",
      });
    }
    const { groupId } = req.params;
    const { newAdminId } = req.body;

    if (!newAdminId) {
      return res.status(400).json({
        message: "newAdminId is required",
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    const oldAdminId = group.groupAdmin.toString();

    // 🔹 STEP 1: Update group admin
    group.groupAdmin = newAdminId;
    await ensureGroupAdminRole(newAdminId);
    // 🔥 STEP 1.1: Remove new admin from members
    group.members = group.members.filter(
      (memberId) => memberId.toString() !== newAdminId
    );

    await group.save();

    // 🔹 STEP 2: Get all tasks of this group
    const contracts = await Contract.find({
      _id: { $in: group.contracts },
    }).select("tasks");

    const taskIds = contracts.flatMap(c => c.tasks);

    if (taskIds.length > 0) {
      // 🔹 STEP 3: Remove old admin from assignedTo
      await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          $pull: { assignedTo: oldAdminId },
        }
      );

      // 🔹 STEP 4: Set new admin + remove from assignedTo
      await Task.updateMany(
        { _id: { $in: taskIds } },
        {
          groupAdmin: newAdminId,
          $pull: { assignedTo: newAdminId },
        }
      );
    }

    // 🔹 STEP 5: Check old admin role (revert if needed)
    const existsElsewhere = await Group.findOne({
      groupAdmin: oldAdminId,
      _id: { $ne: groupId },
      isDeleted: false,
    });

    if (!existsElsewhere) {
      const employeeRole = await Role.findOne({ name: "employee" });

      await User.findByIdAndUpdate(oldAdminId, {
        role: employeeRole._id,
      });
    }

    return res.json({
      message: "Group admin updated successfully",
    });

  } catch (error) {
    console.error("Change admin error:", error);
    return res.status(500).json({
      message: "Failed to update group admin",
    });
  }
};


exports.getMyGroups = async (req, res) => {
  try {
    if (!["group_admin"].includes(req.user.role.name)) {
      return res.status(403).json({
        message: "Only group_admin can  access their groups",
      });
    }
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    // 🔹 STEP 1: Filter
    const filter = {
      company: req.user.company,
      groupAdmin: req.user._id, // ✅ only his groups
      isDeleted: false,

      ...(search && {
        name: { $regex: search, $options: "i" },
      }),
    };

    // 🔹 STEP 2: Fetch groups
    const [groups, total] = await Promise.all([
      Group.find(filter)
        .populate("groupAdmin", "firstName lastName email")
        .populate("contracts", "contractNumber totalCost status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Group.countDocuments(filter),
    ]);
    // 🔹 STEP 3: Add totalMembers only
    const formattedGroups = groups.map(group => ({
      ...group,
      totalMembers: group.members ? group.members.length : 0,
      members: undefined, // ❌ remove members array
    }));

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
    const { groupId } = req.params;

    const group = await Group.findOne({
      _id: groupId,
      company: req.user.company,
      isDeleted: false,
    })
      .populate("groupAdmin", "firstName lastName email phone")
      .populate("members", "firstName lastName email phone")
      .populate({
        path: "contracts",
        select: "contractNumber status totalCost tasks",
        populate: [
          {
            path: "tasks",
            select: "taskName status assignedTo groupAdmin",
            populate: [
              {
                path: "assignedTo",
                select: "firstName lastName email",
              },
              {
                path: "groupAdmin",
                select: "firstName lastName email",
              },
            ],
          },
        ],
      })
      .lean();

    if (!group) {
      return res.status(404).json({
        message: "Group not found",
      });
    }

    // 🔹 OPTIONAL CLEAN FORMAT
    const formattedContracts = group.contracts.map(contract => ({
      _id: contract._id,
      contractNumber: contract.contractNumber,
      status: contract.status,
      totalCost: contract.totalCost,

      totalTasks: contract.tasks?.length || 0,

      tasks: contract.tasks.map(task => ({
        _id: task._id,
        taskName: task.taskName,
        status: task.status,

        groupAdmin: task.groupAdmin
          ? `${task.groupAdmin.firstName} ${task.groupAdmin.lastName}`
          : null,

        assignedTo: task.assignedTo.map(user => ({
          _id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
        })),
      })),
    }));

    const response = {
      _id: group._id,
      name: group.name,
      description: group.description,

      groupAdmin: group.groupAdmin,

      totalMembers: group.members?.length || 0,
      members: group.members,

      totalContracts: group.contracts.length,

      contracts: formattedContracts,

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