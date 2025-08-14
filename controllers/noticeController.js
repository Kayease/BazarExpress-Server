const Notice = require('../models/Notice');

// Get the currently active notice
exports.getActiveNotice = async (req, res) => {
  try {
    const now = new Date();
    // Get all active notices that are within their time period
    const notices = await Notice.find({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ createdAt: -1 });
    
    // Return the most recent active notice, or combine multiple notices
    if (notices.length === 0) {
      res.json({});
    } else if (notices.length === 1) {
      res.json(notices[0]);
    } else {
      // If multiple notices are active, combine their messages
      const combinedMessage = notices.map(n => n.message).join(' | ');
      res.json({ message: combinedMessage, multipleActive: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all notices (admin)
exports.getAllNotices = async (req, res) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new notice (admin)
exports.createNotice = async (req, res) => {
  try {
    const { message, status, startDate, endDate } = req.body;
    console.log('Create Notice Request:', { message, status, startDate, endDate });
    
    if (!startDate || !endDate) {
      console.log('Missing startDate or endDate');
      return res.status(400).json({ error: 'Start date and end date are required.' });
    }
    
    // Remove the restriction - allow multiple active notices
    // if (status === 'active') {
    //   console.log('Creating active notice, deactivating others...');
    //   await Notice.updateMany({ status: 'active' }, { status: 'inactive' });
    //   console.log('Other notices deactivated');
    // }
    
    const notice = new Notice({ message, status, startDate, endDate });
    await notice.save();
    console.log('Notice created successfully:', notice);
    res.status(201).json(notice);
  } catch (err) {
    console.error('Error creating notice:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update a notice (admin)
exports.updateNotice = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, status, startDate, endDate } = req.body;
    console.log('Update Notice Request:', { id, message, status, startDate, endDate });
    
    if (!startDate || !endDate) {
      console.log('Missing startDate or endDate');
      return res.status(400).json({ error: 'Start date and end date are required.' });
    }
    
    // Remove the restriction - allow multiple active notices
    // if (status === 'active') {
    //   console.log('Activating notice, deactivating others...');
    //   await Notice.updateMany({ status: 'active' }, { status: 'inactive' });
    //   console.log('Other notices deactivated');
    // }
    
    const notice = await Notice.findByIdAndUpdate(id, { message, status, startDate, endDate }, { new: true });
    console.log('Notice updated successfully:', notice);
    res.json(notice);
  } catch (err) {
    console.error('Error updating notice:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete a notice (admin)
exports.deleteNotice = async (req, res) => {
  try {
    const { id } = req.params;
    await Notice.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Auto-activate notices based on time (can be called by a cron job)
exports.autoActivateNotices = async () => {
  try {
    const now = new Date();
    
    // Activate notices that should be active now
    await Notice.updateMany(
      {
        status: 'inactive',
        startDate: { $lte: now },
        endDate: { $gte: now }
      },
      { status: 'active' }
    );
    
    // Deactivate notices that have passed their end date
    await Notice.updateMany(
      {
        status: 'active',
        endDate: { $lt: now }
      },
      { status: 'inactive' }
    );
    
    console.log('Auto-activation completed');
  } catch (err) {
    console.error('Error in auto-activation:', err);
  }
};

// Get notice statistics (admin)
exports.getNoticeStats = async (req, res) => {
  try {
    const now = new Date();
    
    // Get all notices
    const allNotices = await Notice.find();
    
    // Calculate stats
    const stats = {
      total: allNotices.length,
      active: allNotices.filter(notice => notice.status === 'active').length,
      inactive: allNotices.filter(notice => notice.status === 'inactive').length,
      currentlyActive: allNotices.filter(notice => 
        notice.status === 'active' && 
        new Date(notice.startDate) <= now && 
        new Date(notice.endDate) >= now
      ).length,
      scheduled: allNotices.filter(notice => 
        notice.status === 'active' && 
        new Date(notice.startDate) > now
      ).length,
      expired: allNotices.filter(notice => 
        new Date(notice.endDate) < now
      ).length
    };
    
    res.json({ stats });
  } catch (err) {
    console.error('Error getting notice stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
}; 