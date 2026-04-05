const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  studentName: { type: String,  required: true },
  roomNumber:  { type: Number,  required: true },
  type:        { type: String,  enum: ["entry", "exit"], required: true },
  timestamp:   { type: Date,    default: Date.now },
  note:        { type: String,  default: "" },
  // Late-entry fields
  isLate:      { type: Boolean, default: false },     // entry after 22:30
  warningNum:  { type: Number,  default: null },      // which warning this is (1 or 2+)
  // Exit-exception fields
  hasException:   { type: Boolean, default: false },
  exceptionReason:{ type: String,  default: "" }      // "Travel Ticket" or "Medical Emergency"
});

module.exports = mongoose.model("Attendance", attendanceSchema);
