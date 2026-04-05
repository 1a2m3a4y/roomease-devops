const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  roomNumber:     { type: Number, required: true },
  college:        { type: String, required: true, default: 'MSRIT' },
  hostelBlock:    { type: String, required: true },
  warningCount:   { type: Number, default: 0 },   // curfew warnings (fine at 2)
  registeredAt:   { type: Date,   default: Date.now }
});

module.exports = mongoose.model("Student", studentSchema);