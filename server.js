const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const bodyParser = require("body-parser");
const cors = require("cors");
const fetch = require('node-fetch');

// Import routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const warehouseRoutes = require("./routes/warehouseRoutes");
const errorHandler = require("./middleware/errorHandler");
const brandsRouter = require("./routes/brands");
const taxesRouter = require("./routes/taxes");
const promocodeRoutes = require("./routes/promocodeRoutes");
const productRoutes = require("./routes/productRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const contactRoutes = require("./routes/contactRoutes");
const blogRoutes = require("./routes/blogRoutes");
const noticeRoutes = require("./routes/noticeRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");
const deliveryRoutes = require("./routes/deliveryRoutes");
const noticeController = require("./controllers/noticeController");

const app = express();
const port = process.env.PORT || 4000;
const MONGODB_URI = process.env.DB_URL;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(bodyParser.json());

// Health check route
app.get("/", (req, res) => {
    res.send("Server is running and connected to MongoDB!");
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/brands", brandsRouter);
app.use("/api/taxes", taxesRouter);
app.use("/api/promocodes", promocodeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/location", require("./routes/locationRoutes"));

// Global error handler
app.use(errorHandler);

// Auto-activate notices function
async function runAutoActivation() {
    try {
        await noticeController.autoActivateNotices();
    } catch (err) {
    }
}

// Function to schedule daily auto-activation at 12:00 AM
function scheduleDailyAutoActivation() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // Set to next midnight (12:00 AM)
    
    const timeUntilMidnight = midnight.getTime() - now.getTime();
    
    // Schedule the first run at midnight
    setTimeout(() => {
        runAutoActivation();
        // Then schedule it to run every 24 hours
        setInterval(runAutoActivation, 24 * 60 * 60 * 1000);
    }, timeUntilMidnight);
    
}

// Connect to MongoDB and start server
async function startServer() {
    try {
        await mongoose.connect(MONGODB_URI);
        // Run auto-activation on server start
        await runAutoActivation();
        // Schedule daily auto-activation at 12:00 AM
        scheduleDailyAutoActivation();
        
        app.listen(port, () => {
            console.log('Server started successfully');
        });
    } catch (err) {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    }
}

startServer();