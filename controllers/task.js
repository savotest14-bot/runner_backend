const Contract = require("../models/contract");
const { getFileUrl } = require("../functions/common");
const Task = require("../models/task");
const mongoose = require("mongoose");

exports.getAllTasksForCompanyAdmin = async (req, res) => {
  try {
    const user = req.user;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access tasks",
      });
    }

    const {
      page = 1,
      limit = 10,
      status,
      contractId,
    } = req.query;

    const skip = (page - 1) * limit;

    const filter = {
      company: user.company,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    let taskIdsFromContract = null;
    if (contractId) {
      const contract = await Contract.findOne({
        _id: contractId,
        company: user.company,
        isDeleted: false,
      }).select("tasks");

      if (!contract) {
        return res.status(404).json({
          message: "Contract not found",
        });
      }

      taskIdsFromContract = contract.tasks;
      filter._id = { $in: taskIdsFromContract };
    }

    const tasks = await Task.find(filter)
      .populate("assignedTo", "firstName lastName email")
      .populate("assignedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const total = await Task.countDocuments(filter);

    return res.status(200).json({
      success: true,
      totalTasks: total,
      page: Number(page),
      limit: Number(limit),
      data: tasks,
    });
  } catch (error) {
    console.error("Get all tasks error:", error);
    return res.status(500).json({
      message: "Failed to fetch tasks",
    });
  }
};


exports.getTaskByIdForCompanyAdmin = async (req, res) => {
  try {
    const user = req.user;
    const { taskId } = req.params;

    if (user.role.name !== "company_admin") {
      return res.status(403).json({
        message: "Only company admin can access tasks",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        message: "Invalid task id",
      });
    }

    const task = await Task.findOne({
      _id: taskId,
      company: user.company,
      isDeleted: false,
    })
      .populate("assignedTo", "firstName lastName email phone")
      .populate("assignedBy", "firstName lastName email")
      .lean();

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const contract = await Contract.findOne({
      tasks: task._id,
      company: user.company,
      isDeleted: false,
    })
      .populate("client")
      .populate("property")
      .lean();

    if (!contract) {
      return res.status(404).json({
        message: "Contract not found for this task",
      });
    }

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
      data: {
        task,
        contract: {
          _id: contract._id,
          contractNumber: contract.contractNumber,
          contractType: contract.contractType,
          startDate: contract.startDate,
          endDate: contract.endDate,
          status: contract.status,
          totalCost: contract.totalCost,
        },
        client: contract.client,
        property: contract.property,
      },
    });
  } catch (error) {
    console.error("Get task by id error:", error);
    return res.status(500).json({
      message: "Failed to fetch task details",
    });
  }
};