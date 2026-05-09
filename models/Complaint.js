const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema({
  studentName:  { type: String,  required: true },
  roomNumber:   { type: Number,  required: true },
  hostelBlock:  { type: String,  required: true },
  category:     {
    type: String,
    enum: ["Room Issue", "Amenity", "Query", "Discrepancy", "Other"],
    required: true
  },
  title:        { type: String,  required: true },
  description:  { type: String,  default: "" },
  status:       { type: String,  enum: ["open", "resolved"], default: "open" },
  createdAt:    { type: Date,    default: Date.now },
  resolvedAt:   { type: Date,    default: null }
});

module.exports = mongoose.model("Complaint", complaintSchema);
