const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");

const { getEligibleUsersForGroup, getAvailableContracts, createGroup, getAllGroups, getGroupDetails, updateGroup, deleteGroup, changeGroupAdmin, getMyGroups, getGroupFullDetails } = require("../controllers/group");

router.get("/eligible-users", authenticate, authorize("view_group"), getEligibleUsersForGroup);

router.get("/getAvailableContracts", authenticate, authorize("view_group"), getAvailableContracts);

router.post("/createGroup", authenticate, authorize("create_group"), createGroup);

router.get("/getAllGroups", authenticate, authorize("view_group"), getAllGroups)

router.get("/getGroupDetails/:groupId", authenticate, authorize("view_group"), getGroupDetails);

router.put("/updateGroup/:groupId", authenticate, authorize("update_group"), updateGroup);

router.delete("/deleteGroup/:groupId", authenticate, authorize("delete_group"), deleteGroup);

router.patch("/changeGroupAdmin/:groupId", authenticate, authorize("update_group"), changeGroupAdmin);

router.get("/getMyGroups", authenticate, authorize("view_group"), getMyGroups);

router.get("/getGroupFullDetails/:groupId", authenticate, authorize("view_group"), getGroupFullDetails);
module.exports = router;