require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const connectDBAndSeed = require("./config/db");
const cors = require("cors");
const path = require("path");
const http = require("http"); // ✅ IMPORTANT
const initSocket = require("./sockets"); // ✅ IMPORT SOCKET

const app = express();

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());

// app.use(
//   cors({
//     origin: ["http://localhost:5173", "http://127.0.0.1:5500"],
//     credentials: true,
//   })
// );

app.use(
  cors({
    origin: "*"
  })
);


app.get("/", (req, res) => {
  res.send("Server is running....");
});

// routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/admin", require("./routes/admin.routes"));
app.use("/api/employee", require("./routes/employee"));
app.use("/api/contract", require("./routes/contract"));
app.use("/api/company-admin", require("./routes/companyAdmin"));
app.use("/api/task", require("./routes/task"));
app.use("/api/plan", require("./routes/plan"));
app.use("/api/group", require("./routes/group"));
app.use("/api/ticket", require("./routes/ticket"));
app.use("/api/chat", require("./routes/chat"));

/* ============================= SERVER ============================= */

const startServer = async () => {
  await connectDBAndSeed();

  const PORT = process.env.PORT || 5004;

  // ✅ create HTTP server
  const server = http.createServer(app);

  // ✅ initialize socket
  initSocket(server);

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer();