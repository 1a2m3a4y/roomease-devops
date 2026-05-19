const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  roomNumber:     { type: Number, required: true },
  college:        { type: String, required: true, default: 'MSRIT' },
  hostelBlock:    { type: String, required: true },
  mobile:         { type: String, default: '' },
  email:          { type: String, default: '' },
  fatherName:     { type: String, default: '' },
  motherName:     { type: String, default: '' },
  parentMobile:   { type: String, default: '' },
  parentEmail:    { type: String, default: '' },
  warningCount:   { type: Number, default: 0 },   // curfew warnings (fine at 2)
  photoUrl:       { type: String, default: '' },   // base64 data URI (optional)
  registeredAt:   { type: Date,   default: Date.now }
});

module.exports = mongoose.model("Student", studentSchema);