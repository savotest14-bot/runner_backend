// sockets/socketAuth.js

const jwt = require("jsonwebtoken");
const User = require("../models/user");
const Group = require("../models/group");

module.exports = async (socket, next) => {
  try {
    // 1. Get token from client
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Unauthorized: No token"));
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Get user
    const user = await User.findById(decoded.id)
      .populate("role"); // IMPORTANT

    if (!user) {
      return next(new Error("User not found"));
    }

    // 4. Get group roles (YOUR LOGIC)
    let isGroupAdmin = false;
    let groupRoles = [];

    if (user.role.name === "employee") {
      const groups = await Group.find({
        "members.user": user._id,
        isDeleted: false
      }).select("members");

      groupRoles = groups.map(group => {
        const member = group.members.find(
          m => m.user.toString() === user._id.toString()
        );

        const role = member?.role;

        if (role === "GROUP_ADMIN") {
          isGroupAdmin = true;
        }

        return {
          groupId: group._id,
          role,
          isAdmin: role === "GROUP_ADMIN"
        };
      });
    }

    // 5. Attach to socket ✅
    socket.user = {
      _id: user._id,
      role: user.role.name,
      groupRoles,
      isGroupAdmin
    };

    next();
  } catch (error) {
    next(new Error("Unauthorized"));
  }
};