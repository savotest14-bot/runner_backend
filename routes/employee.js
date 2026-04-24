const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const { uploadEmployeeImages } = require("../middlewares/employeeUploads");
const { createEmployee, getAllEmployees, getEmployeeById, updateEmployee, toggleEmployeeDeleteByCompanyAdmin, getProfileForEmployee, updateEmployeeProfile, getEmployeeFinancial, getEmployeeDashboard } = require("../controllers/employee");
const authorize = require("../middlewares/authorize");
const { getMySubTasks, startSubTaskTimer, stopSubTaskTimer, uploadBeforeWorkImage, uploadAfterWorkImage, checkGeoFence } = require("../controllers/task");
const { uploads } = require("../utils/upload")
router.post(
  "/create",
  authenticate,
  authorize("create_user"),
  uploadEmployeeImages,
  createEmployee
);

router.get(
  "/getAllEmployees",
  authenticate,
  authorize("view_user"),
  getAllEmployees
);

router.get(
  "/getEmployeeById/:employeeId",
  authenticate,
  authorize("view_user"),
  getEmployeeById
);

router.get("/getProfile", authenticate, getProfileForEmployee);

router.put(
  "/updateEmployeeProfile",
  authenticate,
  uploadEmployeeImages,
  updateEmployeeProfile
);

router.put(
  "/update/:employeeId",
  authenticate,
  authorize("update_user"),
  uploadEmployeeImages,
  updateEmployee
);

router.patch(
  "/delete/:id",
  authenticate,
  authorize("manage_employees"),
  toggleEmployeeDeleteByCompanyAdmin
);

router.get("/getMySubTasks", authenticate, authorize("view_tasks"), getMySubTasks)

router.patch("/startSubTaskTimer/:subTaskId", authenticate, authorize("view_tasks"), startSubTaskTimer)

router.patch("/stopSubTaskTimer/:subTaskId", authenticate, authorize("view_tasks"), stopSubTaskTimer);

router.patch("/uploadBeforeWorkImage/:subTaskId", authenticate, uploads.array("workImage", 5), checkGeoFence, uploadBeforeWorkImage);

router.patch("/uploadAfterWorkImage/:subTaskId", authenticate, uploads.array("workImage", 5), checkGeoFence, uploadAfterWorkImage);

router.get("/getEmployeeFinancial", authenticate, getEmployeeFinancial);

router.get("/getEmployeeDashboard", authenticate, getEmployeeDashboard);

module.exports = router;