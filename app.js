require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Import Model
const Student = require("./models/Student");

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Routes

// Test route
app.get("/", (req, res) => {
    res.send("RoomEase Backend Running 🚀");
});

// Add student
app.post("/add", async (req, res) => {
    try {
        const { name, roomNumber } = req.body;

        const newStudent = new Student({
            name,
            roomNumber
        });

        await newStudent.save();
        res.json(newStudent);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all students
app.get("/students", async (req, res) => {
    try {
        const students = await Student.find();
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PORT FIX (IMPORTANT FOR RENDER)
const PORT = process.env.PORT || 3000;

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});