require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const path     = require("path");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const Student    = require("./models/Student");
const Attendance = require("./models/Attendance");
const Violation  = require("./models/Violation");
const { VIOLATION_FINES } = require("./models/Violation");

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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ── Frontend ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Violation types & fines (for frontend to consume) ─────────────────────
app.get("/meta/violations", (req, res) => {
  res.json(VIOLATION_FINES);
});

// ── STUDENT ROUTES ────────────────────────────────────────────────────────

app.post("/add", async (req, res) => {
  try {
    const { name, roomNumber, college, hostelBlock } = req.body;
    if (!name || !roomNumber || !hostelBlock) return res.status(400).json({ error: "Name, room number, and hostel block are required" });
    const newStudent = new Student({ 
      name: name.trim(), 
      roomNumber: Number(roomNumber),
      college: college || 'MSRIT',
      hostelBlock 
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
    const { name, roomNumber, college, hostelBlock } = req.body;
    const student = await Student.findByIdAndUpdate(
      req.params.id, 
      { name: name.trim(), roomNumber: Number(roomNumber), college: college || 'MSRIT', hostelBlock },
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));