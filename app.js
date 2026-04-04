require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// 👉 IMPORT MODEL HERE
const Student = require("./models/Student");

const app = express();

app.use(express.json());
app.use(cors());


// ✅ ROOT ROUTE
app.get("/", (req, res) => {
  res.send("RoomEase API Running 🚀");
});


// 🚀 👉 ADD YOUR APIs HERE (JUST BELOW THIS)

app.post("/add", async (req, res) => {
  try {
    const student = new Student(req.body);
    await student.save();
    res.send(student);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/students", async (req, res) => {
  const students = await Student.find();
  res.send(students);
});

app.put("/allocate/:id", async (req, res) => {
  const student = await Student.findByIdAndUpdate(
    req.params.id,
    { roomNumber: req.body.roomNumber },
    { new: true }
  );
  res.send(student);
});


// ✅ DATABASE CONNECTION
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


// ✅ SERVER START
app.listen(3000, () => {
  console.log("Server running on port 3000");
});