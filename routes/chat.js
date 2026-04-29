const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { uploads } = require("../utils/upload");
const { initChat, sendMessage, getMessages, getChatList } = require("../controllers/chat.controller");

router.post("/initChat", authenticate, initChat);
router.post("/sendMessage", authenticate, uploads.array("chatFile", 5), sendMessage);
router.get("/getMessages/:chatId", authenticate, getMessages);
router.get("/getChatList", authenticate, getChatList)

module.exports = router;