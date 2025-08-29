const Warehouse = require('../models/Warehouse');

/**
 * Check if pincodes are already assigned to other warehouses
 * @param {string[]} pincodes - Array of pincodes to check
 * @param {string} excludeWarehouseId - Warehouse ID to exclude from check (for updates)
 * @returns {Promise<Object>} - Object containing conflicts information
 */
async function checkPincodeConflicts(pincodes, excludeWarehouseId = null) {
    if (!pincodes || pincodes.length === 0) {
        return { hasConflicts: false, conflicts: [] };
    }

    const query = {
        'deliverySettings.deliveryPincodes': { $in: pincodes }
    };

    // Exclude current warehouse if updating
    if (excludeWarehouseId) {
        query._id = { $ne: excludeWarehouseId };
    }

    const conflictingWarehouses = await Warehouse.find(query)
        .select('name deliverySettings.deliveryPincodes');

    if (conflictingWarehouses.length === 0) {
        return { hasConflicts: false, conflicts: [] };
    }

    const conflicts = [];
    for (const warehouse of conflictingWarehouses) {
        const conflictingPincodes = warehouse.deliverySettings.deliveryPincodes.filter(
            pincode => pincodes.includes(pincode)
        );
        
        if (conflictingPincodes.length > 0) {
            conflicts.push({
                warehouseId: warehouse._id,
                warehouseName: warehouse.name,
                pincodes: conflictingPincodes
            });
        }
    }

    return {
        hasConflicts: conflicts.length > 0,
        conflicts: conflicts
    };
}

/**
 * Validate pincode format
 * @param {string} pincode - Pincode to validate
 * @returns {boolean} - True if valid
 */
function isValidPincode(pincode) {
    return /^\d{6}$/.test(pincode);
}

/**
 * Validate array of pincodes
 * @param {string[]} pincodes - Array of pincodes to validate
 * @returns {Object} - Validation result
 */
function validatePincodes(pincodes) {
    if (!Array.isArray(pincodes)) {
        return { isValid: false, error: 'Pincodes must be an array' };
    }

    const invalidPincodes = pincodes.filter(pincode => !isValidPincode(pincode));
    if (invalidPincodes.length > 0) {
        return {
            isValid: false,
            error: `Invalid pincodes: ${invalidPincodes.join(', ')}. Pincodes must be 6-digit numbers.`
        };
    }

    const duplicates = pincodes.filter((pincode, index) => pincodes.indexOf(pincode) !== index);
    if (duplicates.length > 0) {
        return {
            isValid: false,
            error: `Duplicate pincodes found: ${[...new Set(duplicates)].join(', ')}`
        };
    }

    return { isValid: true };
}

module.exports = {
    checkPincodeConflicts,
    isValidPincode,
    validatePincodes
};