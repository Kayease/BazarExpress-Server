const Warehouse = require("../models/Warehouse");

// TODO: Replace with real user auth, for now use req.body.userId or req.user.id
exports.createWarehouse = async(req, res, next) => {
    try {
        const {
            name,
            address,
            location,
            contactPhone,
            email,
            capacity,
            status,
            userId,
        } = req.body || {};
        if (!name || !address || !userId) {
            return res
                .status(400)
                .json({ error: "Missing required fields: name, address, userId" });
        }
        const warehouse = await Warehouse.createWarehouse({
            name,
            address,
            location,
            contactPhone,
            email,
            capacity,
            status,
            userId,
        });
        res.status(201).json(warehouse);
    } catch (err) {
        next(err);
    }
};

exports.getWarehouses = async(req, res, next) => {
    try {
        const { userId } = req.query;
        let warehouses;
        if (userId) {
            warehouses = await Warehouse.getWarehousesByUser(userId);
        } else {
            warehouses = await Warehouse.find(); // Return all warehouses if no userId
        }
        res.json(warehouses);
    } catch (err) {
        next(err);
    }
};

exports.updateWarehouse = async(req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        updates.updatedAt = new Date();
        const updated = await Warehouse.updateWarehouse(id, updates);
        res.json(updated);
    } catch (err) {
        next(err);
    }
};

exports.deleteWarehouse = async(req, res, next) => {
    try {
        const { id } = req.params;
        await Warehouse.deleteWarehouse(id);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};