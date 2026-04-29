const Group = require("../models/group");

module.exports = async (userId) => {
  const exists = await Group.exists({
    "members.user": userId,
    "members.role": "GROUP_ADMIN",
    isDeleted: false
  });

  return !!exists;
};