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
    if (!addressData.type || (!addressData.building && !addressData.area) || !addressData.city || !addressData.state || !addressData.pincode) {
      return res.status(400).json({ error: 'Missing required address fields (type, building or area, city, state, pincode)' });
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
      console.log('Unsetting other default addresses for user:', userId, 'excluding address:', addressId);
      try {
        const resetResult = await User.updateOne(
          { _id: userId },
          { $set: { "address.$[elem].isDefault": false, "address.$[elem].updatedAt": Date.now() } },
          { 
            arrayFilters: [{ 
              "elem.isDefault": true,
              "elem.id": { 
                $nin: [addressId, Number(addressId), String(addressId)]
              }
            }] 
          }
        );
        console.log('Reset other defaults result:', resetResult);
      } catch (resetError) {
        console.error('Error resetting other default addresses:', resetError);
        // Continue with the update even if reset fails
      }
    }

    let result;
    console.log('Attempting to update address with ID:', addressId, 'Type:', typeof addressId);
    
    if (Object.keys(updateData).length === 1 && Object.prototype.hasOwnProperty.call(updateData, 'isDefault')) {
      // Only update isDefault field
      console.log('Updating only isDefault field');
      result = await User.updateOne(
        { _id: userId, $or: [{ "address.id": addressId }, { "address.id": Number(addressId) }, { "address.id": String(addressId) }] },
        { $set: { "address.$[addr].isDefault": updateData.isDefault, "address.$[addr].updatedAt": Date.now() } },
        { arrayFilters: [{ $or: [{ "addr.id": addressId }, { "addr.id": Number(addressId) }, { "addr.id": String(addressId) }] }] }
      );
    } else {
      // Update the address in the array (full update)
      console.log('Performing full address update');
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
      if (user && user.address) {
        console.log('User addresses:', user.address.map(addr => ({ id: addr.id, type: addr.type })));
      } else {
        console.log('User has no addresses or user not found');
      }
      return res.status(404).json({ error: `Address not found with ID: ${addressId}` });
    }

    // Get the updated user to return the current address
    const user = await User.findById(userId);
    const updatedAddress = user.address.find(addr => 
      addr.id == addressId || addr.id == Number(addressId) || addr.id == String(addressId)
    );

    console.log('Updated address:', updatedAddress);
    res.json({ address: updatedAddress });
  } catch (err) {
    console.error('Error in updateAddress:', err);
    res.status(500).json({ 
      error: 'Server error', 
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
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
    const addressId = req.params.addressId || req.query.id;

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

// Admin functions for user management
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password') // Exclude password field
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalUsers = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers / limit),
        totalUsers,
        hasNext: page < Math.ceil(totalUsers / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active or inactive' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { status, updatedAt: new Date() },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      success: true, 
      message: `User status updated to ${status}`,
      user 
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}; 