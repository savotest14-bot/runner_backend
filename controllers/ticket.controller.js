const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Ticket = require("../models/Ticket");
const User = require("../models/user");
const mongoose = require("mongoose");
const Role = require("../models/role")

exports.createTicket = async (req, res) => {
  try {
    const { title, description, assignedTo } = req.body;
    const user = req.user;

    const assignedUser = await User.findById(assignedTo).populate("role");

    if (!assignedUser) {
      return res.status(404).json({ message: "Assigned user not found" });
    }

    const senderRole = user.role.name;
    const receiverRole = assignedUser.role.name;

    /* ================= ROLE VALIDATION ================= */

    let isAllowed = false;

    // employee → company_admin / finance_manager
    if (
      senderRole === "employee" &&
      ["company_admin", "finance_manager"].includes(receiverRole)
    ) {
      isAllowed = true;
    }

    // company_admin → superAdmin
    if (
      senderRole === "company_admin" &&
      receiverRole === "superAdmin"
    ) {
      isAllowed = true;
    }

    if (!isAllowed) {
      return res.status(403).json({
        message: "You are not allowed to create ticket for this user"
      });
    }

    /* ================= ATTACHMENTS ================= */

    let attachments = [];

    if (req.files && req.files.length > 0) {
      attachments = req.files.map(file => {
        let type = "file";

        if (file.mimetype.startsWith("image")) type = "image";
        else if (file.mimetype === "application/pdf") type = "pdf";

        return {
          url: `/uploads/ticketFile/${file.filename}`,
          type,
          fileName: file.originalname
        };
      });
    }

    /* ================= CREATE ================= */

    const ticket = await Ticket.create({
      title,
      description,
      createdBy: user._id,
      assignedTo,
      attachments
    });

    res.status(201).json({
      success: true,
      data: ticket
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTickets = async (req, res) => {
  try {
    const user = req.user;
    // pagination
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const { status, search } = req.query;
    // ================= FILTER =================
    let filter = {};

    // role-based filter
    if (user.role.name === "employee") {
      filter.createdBy = user._id;
    } else if (
      ["company_admin", "finance_manager"].includes(user.role.name)
    ) {
      filter.assignedTo = user._id;
    } else if (user.role.name === "superAdmin") {
      filter.assignedTo = user._id;
    }

    // status filter
    if (status) {
      filter.status = status;
    }

    // search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    // ================= QUERY =================
    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate("createdBy", "firstName lastName")
        .populate("assignedTo", "firstName lastName role")
        .populate("group", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      Ticket.countDocuments(filter)
    ]);

    // ================= RESPONSE =================
    res.json({
      success: true,
      data: tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAssignableUsers = async (req, res) => {
  try {
    const user = req.user;

    let rolesToFetch = [];
    let userFilter = {
      isDeleted: false
    };

    /* ================= ROLE LOGIC ================= */

    if (user.role.name === "employee") {
      rolesToFetch = ["company_admin", "finance_manager"];

      // ✅ company match required
      if (!user.company) {
        return res.status(400).json({
          message: "Employee must belong to a company"
        });
      }

      userFilter.company = user.company;

    } else if (user.role.name === "company_admin") {
      rolesToFetch = ["superAdmin"];

      // ❌ no company filter for superAdmin

    } else {
      return res.status(403).json({
        message: "No assignable users for this role"
      });
    }

    /* ================= GET ROLE IDS ================= */

    const roles = await Role.find({
      name: {
        $in: rolesToFetch.map(r => new RegExp(`^${r}$`, "i"))
      }
    }).select("_id");

    if (!roles.length) {
      return res.status(404).json({
        message: "Roles not found",
        rolesToFetch
      });
    }

    const roleIds = roles.map(r => r._id);

    /* ================= FETCH USERS ================= */

    const users = await User.find({
      ...userFilter,
      role: { $in: roleIds }
    })
      .populate("role", "name")
      .select("firstName lastName email profilePic role company");

    res.json({
      success: true,
      data: users
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id)
      .populate("createdBy", "firstName lastName email profilePic")
      .populate("assignedTo", "firstName lastName email profilePic role")
      .populate("group", "name");

    if (!ticket) {
      return res.status(404).json({
        message: "Ticket not found"
      });
    }

    /* ================= GET CHAT WITH POPULATION ================= */

    let chat = null;

    if (ticket.chatEnabled) {
      chat = await Chat.findOne({
        type: "ticket",
        ticket: ticket._id
      })
        .populate({
          path: "lastMessage",
          populate: {
            path: "sender",
            select: "firstName lastName profilePic"
          }
        })
        .populate("participants", "firstName lastName profilePic")
        .select("_id lastMessage participants");
    }

    /* ================= RESPONSE ================= */

    res.json({
      success: true,
      data: {
        ticket,
        chat
      }
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

exports.updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "accepted" | "closed"

    const allowedStatuses = ["accepted", "closed"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status"
      });
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // 🔐 Only assigned user can update
    if (ticket.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }

    /* ================= STATUS RULES ================= */

    // ❌ prevent re-processing
    if (ticket.status === "closed") {
      return res.status(400).json({
        message: "Ticket already closed"
      });
    }

    // ❌ accept only if open
    if (status === "accepted" && ticket.status !== "open") {
      return res.status(400).json({
        message: "Only open tickets can be accepted"
      });
    }

    // ❌ close only if accepted or in_progress
    if (
      status === "closed" &&
      !["accepted", "in_progress"].includes(ticket.status)
    ) {
      return res.status(400).json({
        message: "Ticket must be accepted or in progress to close"
      });
    }

    /* ================= UPDATE TICKET ================= */

    ticket.status = status;

    if (status === "accepted") {
      ticket.chatEnabled = true;
    }

    await ticket.save();

    /* ================= HANDLE CHAT ONLY ON ACCEPT ================= */

    let chat = null;

    if (status === "accepted") {
      chat = await Chat.findOne({
        type: "ticket",
        ticket: ticket._id
      });

      if (!chat) {
        chat = await Chat.create({
          type: "ticket",
          participants: [ticket.createdBy, ticket.assignedTo],
          ticket: ticket._id
        });

        const message = await Message.create({
          chat: chat._id,
          sender: ticket.createdBy,
          text: ticket.description,
          attachments: ticket.attachments || [],
          seenBy: [ticket.createdBy]
        });

        chat.lastMessage = message._id;
        await chat.save();
      }
    }

    res.json({
      success: true,
      message:
        status === "accepted"
          ? "Ticket accepted and chat started"
          : "Ticket closed successfully",
      data: {
        ticketId: ticket._id,
        chatId: chat?._id || null
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};