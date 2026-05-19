require("dotenv").config();
const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const path       = require("path");
const helmet     = require("helmet");
const morgan     = require("morgan");
const rateLimit  = require("express-rate-limit");
const promClient = require("prom-client");

// ── Prometheus Metrics ────────────────────────────────────────────────────
const promRegister = promClient.register;
promClient.collectDefaultMetrics({ register: promRegister, prefix: "roomease_" });

const httpRequestDuration = new promClient.Histogram({
  name: "roomease_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new promClient.Counter({
  name: "roomease_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"]
});

const activeRequests = new promClient.Gauge({
  name: "roomease_active_requests",
  help: "Number of active HTTP requests"
});

const dbConnectionStatus = new promClient.Gauge({
  name: "roomease_db_connected",
  help: "MongoDB connection status (1=connected, 0=disconnected)"
});

const app = express();

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,   // Allow inline scripts in static HTML
  crossOriginEmbedderPolicy: false
}));

// ── Request logging ───────────────────────────────────────────────────────
const logFormat = process.env.NODE_ENV === "production" ? "combined" : "dev";
app.use(morgan(logFormat));

// ── Rate limiting ─────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
app.use(limiter);

// ── Core middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// ── Prometheus metrics middleware ─────────────────────────────────────────
app.use((req, res, next) => {
  // Skip metrics endpoint itself to avoid recursion
  if (req.path === "/metrics") return next();
  activeRequests.inc();
  const end = httpRequestDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
    activeRequests.dec();
  });
  next();
});

// ── Prometheus /metrics endpoint ──────────────────────────────────────────
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", promRegister.contentType);
    res.end(await promRegister.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

const Student    = require("./models/Student");
const Attendance = require("./models/Attendance");
const Violation  = require("./models/Violation");
const Complaint  = require("./models/Complaint");
const { VIOLATION_FINES } = require("./models/Violation");
const { sendViolationAlert } = require("./utils/smsService");

// ── Curfew rules ──────────────────────────────────────────────────────────
const ENTRY_CURFEW_HOUR   = 22;  // 10 PM
const ENTRY_CURFEW_MIN    = 30;  // :30  → late after 22:30
const EXIT_CURFEW_HOUR    = 22;  // 10 PM
const EXIT_CURFEW_MIN     = 20;  // :20  → no exit after 22:20 without exception
const FINE_THRESHOLD      = 2;   // 2nd warning triggers auto fine

function isAfterCurfew(date, h, m) {
  const mins = date.getHours() * 60 + date.getMinutes();
  const curfewMins = h * 60 + m;
  const morningMins = 6 * 60; // Curfew ends at 6:00 AM
  return mins > curfewMins || mins < morningMins;
}

// ── MongoDB connection with readiness tracking ───────────────────────────
let isDbReady = false;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    isDbReady = true;
    dbConnectionStatus.set(1);
    console.log(`[RoomEase] MongoDB connected (${process.env.NODE_ENV || "development"})`);
  })
  .catch(err => {
    console.error("[RoomEase] MongoDB connection error:", err.message);
    process.exit(1);
  });

mongoose.connection.on("disconnected", () => { isDbReady = false; dbConnectionStatus.set(0); });
mongoose.connection.on("reconnected",  () => { isDbReady = true;  dbConnectionStatus.set(1); });

// ── Health-check endpoints (used by K8s probes & Docker HEALTHCHECK) ─────
app.get("/healthz", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/readyz", (req, res) => {
  if (isDbReady) {
    return res.status(200).json({ status: "ready", db: "connected" });
  }
  res.status(503).json({ status: "not ready", db: "disconnected" });
});

// ── Admin authentication ──────────────────────────────────────────────────
const ADMIN_UID  = process.env.ADMIN_UID  || "uid1234";
const ADMIN_PASS = process.env.ADMIN_PASS || "maa@12345";
const adminTokens = new Set(); // active session tokens

app.post("/api/admin/login", (req, res) => {
  const { uid, password } = req.body;
  if (uid === ADMIN_UID && password === ADMIN_PASS) {
    const token = require("crypto").randomUUID();
    adminTokens.add(token);
    // Auto-expire token after 8 hours
    setTimeout(() => adminTokens.delete(token), 8 * 60 * 60 * 1000);
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, error: "Invalid User ID or Password" });
});

app.get("/api/admin/verify", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token && adminTokens.has(token)) {
    return res.json({ valid: true });
  }
  res.status(401).json({ valid: false });
});

app.post("/api/admin/logout", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token) adminTokens.delete(token);
  res.json({ success: true });
});

// ── Frontend ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "landing.html"));
});

// Admin login page
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

// Admin dashboard (served to anyone — auth is checked client-side via token)
app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Student portal
app.get("/student", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "student.html"));
});

// ── Violation types & fines (for frontend to consume) ─────────────────────
app.get("/meta/violations", (req, res) => {
  res.json(VIOLATION_FINES);
});

// ── STUDENT ROUTES ────────────────────────────────────────────────────────

app.post("/add", async (req, res) => {
  try {
    const { name, roomNumber, college, hostelBlock, mobile, email, fatherName, motherName, parentMobile, parentEmail, photoUrl } = req.body;
    if (!name || !roomNumber || !hostelBlock) return res.status(400).json({ error: "Name, room number, and hostel block are required" });
    const newStudent = new Student({ 
      name: name.trim(), 
      roomNumber: Number(roomNumber),
      college: college || 'MSRIT',
      hostelBlock,
      mobile: (mobile || '').trim(),
      email: (email || '').trim(),
      fatherName: (fatherName || '').trim(),
      motherName: (motherName || '').trim(),
      parentMobile: (parentMobile || '').trim(),
      parentEmail: (parentEmail || '').trim(),
      photoUrl: photoUrl || ''
    });
    await newStudent.save();
    res.json(newStudent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/students", async (req, res) => {
  try {
    const students = await Student.find().sort({ name: 1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify student exists (used by student portal)
app.get("/students/verify", async (req, res) => {
  try {
    const { name, roomNumber, hostelBlock } = req.query;
    if (!name || !roomNumber) return res.status(400).json({ error: "name and roomNumber are required" });

    const query = {
      name: new RegExp(`^${name.trim()}$`, "i"),
      roomNumber: Number(roomNumber)
    };
    if (hostelBlock) query.hostelBlock = hostelBlock;

    const student = await Student.findOne(query);
    if (!student) return res.status(404).json({ verified: false, error: "No registered student found with these details." });
    res.json({ verified: true, student: { _id: student._id, name: student.name, roomNumber: student.roomNumber, college: student.college, hostelBlock: student.hostelBlock } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/students/:id", async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ error: "Student not found" });
    await Attendance.deleteMany({ studentId: req.params.id });
    await Violation.deleteMany({ studentId: req.params.id });
    res.json({ message: "Student and all associated records removed", student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/students/:id", async (req, res) => {
  try {
    const { name, roomNumber, college, hostelBlock, mobile, email, fatherName, motherName, parentMobile, parentEmail } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.params.id, 
      { name: name.trim(), roomNumber: Number(roomNumber), college: college || 'MSRIT', hostelBlock,
        mobile: (mobile || '').trim(), email: (email || '').trim(),
        fatherName: (fatherName || '').trim(), motherName: (motherName || '').trim(),
        parentMobile: (parentMobile || '').trim(), parentEmail: (parentEmail || '').trim() },
      { new: true, runValidators: true }
    );
    if (!student) return res.status(404).json({ error: "Student not found" });
    
    // Also update localized data in Attendance & Violations
    await Attendance.updateMany({ studentId: req.params.id }, { studentName: student.name, roomNumber: student.roomNumber });
    await Violation.updateMany({ studentId: req.params.id }, { studentName: student.name, roomNumber: student.roomNumber });
    
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload or update student photo (base64 data URI)
app.patch("/students/:id/photo", express.json({ limit: "5mb" }), async (req, res) => {
  try {
    const { photoUrl } = req.body;
    if (!photoUrl && photoUrl !== '') return res.status(400).json({ error: "photoUrl is required" });
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { photoUrl },
      { new: true }
    );
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ATTENDANCE ROUTES ─────────────────────────────────────────────────────

app.post("/attendance", async (req, res) => {
  try {
    const { studentId, type, note, exceptionReason } = req.body;

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const now = new Date();

    // ── EXIT AFTER 22:20 → requires exception ────────────────────────────
    if (type === "exit" && isAfterCurfew(now, EXIT_CURFEW_HOUR, EXIT_CURFEW_MIN)) {
      if (!exceptionReason || !["Travel Ticket", "Medical Emergency"].includes(exceptionReason)) {
        return res.status(403).json({
          error: `Exit not permitted after 10:20 PM. An approved exception (Travel Ticket or Medical Emergency) is required.`,
          curfewBlocked: true
        });
      }
    }

    // ── ENTRY AFTER 22:30 → issue warning, auto-fine after 2nd ──────────
    let isLate      = false;
    let warningNum  = null;
    let autoViolation = null;

    if (type === "entry" && isAfterCurfew(now, ENTRY_CURFEW_HOUR, ENTRY_CURFEW_MIN)) {
      isLate = true;
      student.warningCount += 1;
      warningNum = student.warningCount;
      await student.save();

      // 2nd warning onwards → auto-generate a curfew violation with ₹200 fine
      if (student.warningCount >= FINE_THRESHOLD) {
        const fine = VIOLATION_FINES["Late Return (Curfew)"] || 200;
        autoViolation = await Violation.create({
          studentId:   student._id,
          studentName: student.name,
          roomNumber:  student.roomNumber,
          type:        "Late Return (Curfew)",
          description: `Automatic fine: late entry at ${now.toLocaleTimeString("en-IN")} (Warning #${student.warningCount})`,
          severity:    "medium",
          fine,
          isAuto:      true
        });

        // Send SMS notification to parent (non-blocking)
        sendViolationAlert(student, autoViolation).catch(err => console.error('[SMS] Alert error:', err.message));
      }
    }

    const record = await Attendance.create({
      studentId:        student._id,
      studentName:      student.name,
      roomNumber:       student.roomNumber,
      type,
      note:             note || "",
      isLate,
      warningNum,
      hasException:     !!exceptionReason,
      exceptionReason:  exceptionReason || ""
    });

    res.json({ record, autoViolation, warningNum, isLate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/attendance", async (req, res) => {
  try {
    const records = await Attendance.find().sort({ timestamp: -1 }).limit(200);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/attendance/:studentId", async (req, res) => {
  try {
    const records = await Attendance.find({ studentId: req.params.studentId })
      .sort({ timestamp: -1 }).limit(100);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/attendance/:id", async (req, res) => {
  try {
    const { type, note } = req.body;
    const updateData = {};
    if (type) updateData.type = type;
    if (note !== undefined) updateData.note = note;

    const record = await Attendance.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!record) return res.status(404).json({ error: "Attendance record not found" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/attendance/:id", async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: "Attendance record not found" });
    res.json({ message: "Attendance record removed", record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VIOLATION ROUTES ──────────────────────────────────────────────────────

app.post("/violations", async (req, res) => {
  try {
    const { studentId, type, description, severity } = req.body;
    if (!studentId || !type) return res.status(400).json({ error: "studentId and type are required" });

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const fine = VIOLATION_FINES[type] ?? 0;

    const violation = await Violation.create({
      studentId,
      studentName: student.name,
      roomNumber:  student.roomNumber,
      type,
      description: description || "",
      severity:    severity || "medium",
      fine
    });

    // Send SMS notification to parent (non-blocking)
    sendViolationAlert(student, violation).catch(err => console.error('[SMS] Alert error:', err.message));

    res.json(violation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/violations", async (req, res) => {
  try {
    const violations = await Violation.find().sort({ reportedAt: -1 });
    res.json(violations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/violations/:studentId", async (req, res) => {
  try {
    const violations = await Violation.find({ studentId: req.params.studentId })
      .sort({ reportedAt: -1 });
    res.json(violations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/violations/:id", async (req, res) => {
  try {
    const violation = await Violation.findByIdAndDelete(req.params.id);
    if (!violation) return res.status(404).json({ error: "Violation not found" });
    res.json({ message: "Violation deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark fine as paid
app.patch("/violations/:id/pay", async (req, res) => {
  try {
    const violation = await Violation.findByIdAndUpdate(
      req.params.id,
      { isPaid: true },
      { new: true }
    );
    if (!violation) return res.status(404).json({ error: "Violation not found" });
    res.json(violation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats endpoint
app.get("/stats", async (req, res) => {
  try {
    const [totalStudents, totalViolations, unpaidFines, todayAttendance] = await Promise.all([
      Student.countDocuments(),
      Violation.countDocuments(),
      Violation.aggregate([{ $match: { isPaid: false } }, { $group: { _id: null, total: { $sum: "$fine" } } }]),
      Attendance.countDocuments({ timestamp: { $gte: new Date(new Date().setHours(0,0,0,0)) } })
    ]);
    res.json({
      totalStudents,
      uniqueRooms: await Student.distinct("roomNumber").then(r => r.length),
      totalViolations,
      unpaidFineTotal: unpaidFines[0]?.total || 0,
      todayAttendance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── COMPLAINT ROUTES ─────────────────────────────────────────────────────

// Student submits a complaint
app.post("/complaints", async (req, res) => {
  try {
    const { studentName, roomNumber, hostelBlock, category, title, description } = req.body;
    if (!studentName || !roomNumber || !hostelBlock || !category || !title) {
      return res.status(400).json({ error: "studentName, roomNumber, hostelBlock, category, and title are required" });
    }
    const complaint = await Complaint.create({
      studentName: studentName.trim(),
      roomNumber: Number(roomNumber),
      hostelBlock,
      category,
      title: title.trim(),
      description: description || ""
    });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin fetches all complaints
app.get("/complaints", async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student fetches their own complaints by name + room
app.get("/complaints/mine", async (req, res) => {
  try {
    const { studentName, roomNumber } = req.query;
    if (!studentName || !roomNumber) {
      return res.status(400).json({ error: "studentName and roomNumber query params required" });
    }
    const complaints = await Complaint.find({
      studentName: new RegExp(`^${studentName.trim()}$`, "i"),
      roomNumber: Number(roomNumber)
    }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin marks a complaint as resolved
app.patch("/complaints/:id/resolve", async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status: "resolved", resolvedAt: new Date() },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin deletes a complaint
app.delete("/complaints/:id", async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndDelete(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });
    res.json({ message: "Complaint deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Server startup with graceful shutdown ─────────────────────────────────
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[RoomEase] Server running on port ${PORT}`);
  console.log(`[RoomEase] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`[RoomEase] Health:  http://localhost:${PORT}/healthz`);
  console.log(`[RoomEase] Ready:   http://localhost:${PORT}/readyz`);
});

// Graceful shutdown — let K8s / Docker drain connections before killing
const shutdown = (signal) => {
  console.log(`\n[RoomEase] ${signal} received. Shutting down gracefully…`);
  server.close(() => {
    console.log("[RoomEase] HTTP server closed.");
    mongoose.connection.close(false).then(() => {
      console.log("[RoomEase] MongoDB connection closed.");
      process.exit(0);
    });
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    console.error("[RoomEase] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Export for testing
module.exports = { app, server };