const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { uploadContractFiles } = require("../middlewares/employeeUploads"); 
const { getAllClientsForCompanyAdmin, getAllPropertiesForCompanyAdmin } = require("../controllers/companyAdmin");


// Clients

router.get("/getAllClients", authenticate, authorize("view_contracts"), getAllClientsForCompanyAdmin);

// Property

router.get(
  "/getAllProperties",
  authenticate,
  authorize("view_properties"),
  getAllPropertiesForCompanyAdmin
);


module.exports = router;