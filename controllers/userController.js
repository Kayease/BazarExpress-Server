const User = require('../models/User');

// Get all addresses for the authenticated user
exports.getAddresses = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return all addresses (since we're using hard delete now)
    res.json({ addresses: user.address || [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// Add a new address for the authenticated user
exports.addAddress = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id || req.user.id;
    const addressData = req.body;
    
    // Required fields validation
    if (!addressData.type || !addressData.building || !addressData.area || !addressData.city || !addressData.state || !addressData.pincode) {
      return res.status(400).json({ error: 'Missing required address fields' });
    }

    // Add timestamps and set isActive
    const now = Date.now();
    addressData.id = addressData.id || now;
    addressData.createdAt = now;
    addressData.updatedAt = now;
    addressData.isActive = true;

    // If this is set as default, unset any existing default addresses
    if (addressData.isDefault) {
      await User.updateOne(
        { _id: userId, "address.isDefault": true },
        { $set: { "address.$[elem].isDefault": false } },
        { arrayFilters: [{ "elem.isDefault": true }] }
      );
    }

    // Add the new address to the user's address array
    const user = await User.findByIdAndUpdate(
      userId,
      { $push: { address: addressData } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(201).json({ address: addressData });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// Update an existing address
exports.updateAddress = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id || req.user.id;
    const { addressId } = req.params;
    const updateData = req.body;
    
    console.log('Update address request:', {
      userId,
      addressId,
      updateData: JSON.stringify(updateData, null, 2)
    });
    
    // Don't allow changing the ID of an address
    if (updateData.id && updateData.id != addressId) {
      return res.status(400).json({ error: 'Cannot change address ID' });
    }

    // Update timestamp
    updateData.updatedAt = Date.now();

    // If setting as default, unset any existing default addresses
    if (updateData.isDefault) {
      await User.updateOne(
        { _id: userId, "address.isDefault": true, "address.id": { $ne: addressId } },
        { $set: { "address.$[elem].isDefault": false } },
        { arrayFilters: [{ "elem.isDefault": true }] }
      );
    }

    let result;
    if (Object.keys(updateData).length === 1 && Object.prototype.hasOwnProperty.call(updateData, 'isDefault')) {
      // Only update isDefault field
      result = await User.updateOne(
        { _id: userId, $or: [{ "address.id": addressId }, { "address.id": Number(addressId) }, { "address.id": String(addressId) }] },
        { $set: { "address.$[addr].isDefault": updateData.isDefault, "address.$[addr].updatedAt": Date.now() } },
        { arrayFilters: [{ $or: [{ "addr.id": addressId }, { "addr.id": Number(addressId) }, { "addr.id": String(addressId) }] }] }
      );
    } else {
      // Update the address in the array (full update)
      result = await User.updateOne(
        { _id: userId, $or: [{ "address.id": addressId }, { "address.id": Number(addressId) }, { "address.id": String(addressId) }] },
        { $set: { "address.$[addr]": { ...updateData, id: addressId } } },
        { arrayFilters: [{ $or: [{ "addr.id": addressId }, { "addr.id": Number(addressId) }, { "addr.id": String(addressId) }] }] }
      );
    }

    console.log('Update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

    if (result.matchedCount === 0) {
      console.log('Address not found with ID:', addressId);
      // Let's check what addresses exist
      const user = await User.findById(userId);
      console.log('User addresses:', user.address.map(addr => ({ id: addr.id, type: addr.type })));
      return res.status(404).json({ error: 'Address not found' });
    }

    // Get the updated user to return the current address
    const user = await User.findById(userId);
    const updatedAddress = user.address.find(addr => 
      addr.id == addressId || addr.id == Number(addressId) || addr.id == String(addressId)
    );

    console.log('Updated address:', updatedAddress);
    res.json({ address: updatedAddress });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// Delete (hard delete) an address
exports.deleteAddress = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id || req.user.id;
    const { addressId } = req.params;

    console.log('Delete address request:', { userId, addressId });

    // Hard delete by removing the address from the array
    // Try both string and number versions of addressId
    const result = await User.updateOne(
      { _id: userId },
      { 
        $pull: { 
          address: { 
            $or: [
              { id: addressId }, 
              { id: Number(addressId) }, 
              { id: String(addressId) }
            ]
          }
        }
      }
    );

    console.log('Delete result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

    if (result.matchedCount === 0) {
      console.log('User not found with ID:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    if (result.modifiedCount === 0) {
      console.log('Address not found with ID:', addressId);
      // Let's check what addresses exist
      const user = await User.findById(userId);
      console.log('User addresses:', user.address.map(addr => ({ id: addr.id, type: addr.type })));
      return res.status(404).json({ error: 'Address not found' });
    }

    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (err) {
    console.error('Error in deleteAddress:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// Reset all default addresses for a user
exports.resetDefaultAddresses = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id || req.user.id;
    
    console.log('Reset default addresses request for user:', userId);

    // Update all addresses to set isDefault to false
    const result = await User.updateOne(
      { _id: userId },
      { $set: { "address.$[elem].isDefault": false } },
      { arrayFilters: [{ "elem.isDefault": true }] }
    );

    console.log('Reset default addresses result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      success: true, 
      message: 'All default addresses have been reset',
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Error in resetDefaultAddresses:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// Set an address as default
exports.setDefaultAddress = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user._id || req.user.id;
    const { addressId } = req.params;

    // First, unset any existing default addresses
    await User.updateOne(
      { _id: userId, "address.isDefault": true },
      { $set: { "address.$[elem].isDefault": false } },
      { arrayFilters: [{ "elem.isDefault": true }] }
    );

    // Then set the new default address
    const result = await User.updateOne(
      { _id: userId, "address.id": addressId },
      { $set: { 
          "address.$[addr].isDefault": true,
          "address.$[addr].updatedAt": Date.now()
        } 
      },
      { arrayFilters: [{ "addr.id": addressId }] }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    // Get the updated user to return the current address
    const user = await User.findById(userId);
    const updatedAddress = user.address.find(addr => addr.id == addressId);

    res.json({ address: updatedAddress });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}; 