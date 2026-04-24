const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");

const { getEligibleUsersForGroup, getAvailableContracts, createGroup, getAllGroups, getGroupDetails, updateGroup, deleteGroup, changeGroupAdmin, getMyGroups, getGroupFullDetails, getAvailableTasks, suggestMembers, addGroupMember, removeGroupMember, getGroupAdminDashboard, getGroupMembersForAssign, reviewWorkReport } = require("../controllers/group");

router.get("/eligible-users", authenticate, authorize("view_group"), getEligibleUsersForGroup);

router.get("/getAvailableContracts", authenticate, authorize("view_group"), getAvailableContracts);

router.get("/getAvailableTasks", authenticate, authorize("view_group"), getAvailableTasks)

router.get("/suggestMembers", authenticate, authorize("view_group"), suggestMembers)

router.post("/createGroup", authenticate, authorize("create_group"), createGroup);

router.get("/getAllGroups", authenticate, authorize("view_group"), getAllGroups)

router.get("/getGroupDetails/:groupId", authenticate, authorize("view_group"), getGroupDetails);

router.put("/updateGroup/:groupId", authenticate, authorize("update_group"), updateGroup);

router.delete("/deleteGroup/:groupId", authenticate, authorize("delete_group"), deleteGroup);

router.patch("/changeGroupAdmin/:groupId", authenticate, authorize("update_group"), changeGroupAdmin);

router.patch("/addGroupMember/:groupId", authenticate, addGroupMember);

router.patch("/removeGroupMember/:groupId", authenticate, removeGroupMember)

router.get("/getMyGroups", authenticate, getMyGroups);

router.get("/getGroupFullDetails/:groupId", authenticate, getGroupFullDetails);

router.get("/getGroupAdminDashboard", authenticate, getGroupAdminDashboard);

router.get("/getGroupMembersForAssign/:groupId", authenticate, getGroupMembersForAssign);

router.patch("/reviewWorkReport/:reportId", authenticate, reviewWorkReport);

module.exports = router;