const express = require("express");
const router = express.Router();
const stockTransferController = require("../controllers/stockTransferController");
const { authenticateToken, hasPermission, hasWarehouseAccess } = require("../middleware/authMiddleware");

// Apply authentication to all routes
router.use(authenticateToken);
router.use(hasWarehouseAccess);

// Create new stock transfer
router.post("/", 
    hasPermission(['admin', 'product_inventory_management']),
    stockTransferController.createStockTransfer
);

// Get all stock transfers with filtering
router.get("/", 
    hasPermission(['admin', 'product_inventory_management', 'order_warehouse_management']),
    stockTransferController.getStockTransfers
);

// Get stock transfer statistics
router.get("/stats", 
    hasPermission(['admin', 'product_inventory_management', 'order_warehouse_management']),
    stockTransferController.getStockTransferStats
);

// Get single stock transfer
router.get("/:id", 
    hasPermission(['admin', 'product_inventory_management', 'order_warehouse_management']),
    stockTransferController.getStockTransfer
);

// Update stock transfer status
router.patch("/:id/status", 
    hasPermission(['admin', 'product_inventory_management']),
    stockTransferController.updateStockTransferStatus
);

// Delete stock transfer (only pending)
router.delete("/:id", 
    hasPermission(['admin', 'product_inventory_management']),
    stockTransferController.deleteStockTransfer
);

module.exports = router;