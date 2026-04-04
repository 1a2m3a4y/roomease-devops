const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: String,
  roomNumber: Number
});

module.exports = mongoose.model("Student", studentSchema);