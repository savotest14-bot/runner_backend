const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { createTicket, getTickets,  getAssignableUsers, updateTicketStatus, getTicketById } = require("../controllers/ticket.controller");
const { uploads } = require("../utils/upload");

router.post("/createTicket", authenticate, uploads.array("ticketFile", 5), createTicket);

router.get("/getTickets", authenticate, getTickets);

router.get("/getTicketById/:id", authenticate, getTicketById)

router.get("/getAssignableUsers", authenticate, getAssignableUsers)

router.patch("/acceptTicket/:id", authenticate, updateTicketStatus);

module.exports = router;