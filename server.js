const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();
const bodyParser = require("body-parser");
const cors = require("cors");

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
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const orderRoutes = require("./routes/orderRoutes");
const invoiceSettingsRoutes = require("./routes/invoiceSettingsRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const abandonedCartRoutes = require("./routes/abandonedCartRoutes");
const searchGapRoutes = require("./routes/searchGapRoutes");
const stockTransferRoutes = require("./routes/stockTransferRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const noticeController = require("./controllers/noticeController");

// Import abandoned cart middleware
const { cleanupExpiredCarts } = require("./middleware/abandonedCartMiddleware");

const app = express();
const port = process.env.PORT;
const MONGODB_URI = process.env.DB_URL;

// Middleware
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000',
  'https://bazarxpress.kayease.com',
  'https://www.bazarxpress.kayease.com',
  // Add more if needed
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow non-browser requests
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
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
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/invoice-settings", invoiceSettingsRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/abandoned-carts", abandonedCartRoutes);
app.use("/api/search-gaps", searchGapRoutes);
app.use("/api/stock-transfers", stockTransferRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/location", require("./routes/locationRoutes"));
app.use("/api/setup", require("./routes/setup"));

// Add abandoned cart middleware for cleanup only
app.use(cleanupExpiredCarts);

// Global error handler
app.use(errorHandler);

// Auto-activate notices function
async function runAutoActivation() {
    try {
        await noticeController.autoActivateNotices();
    } catch (err) {
    }
}

// Scheduled abandoned cart cleanup function
async function runAbandonedCartCleanup() {
    try {
        const AbandonedCartService = require('./services/abandonedCartService');
        await AbandonedCartService.cleanupExpiredCarts();
        console.log('Scheduled abandoned cart cleanup completed');
    } catch (err) {
        console.error('Scheduled abandoned cart cleanup failed:', err);
    }
}

// Schedule abandoned cart cleanup every 24 hours
setInterval(runAbandonedCartCleanup, 24 * 60 * 60 * 1000);

// Run initial checks
runAutoActivation();
runAbandonedCartCleanup();

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