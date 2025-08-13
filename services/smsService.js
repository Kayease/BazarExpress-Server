const axios = require('axios');

// SMS Gateway configuration
const SMS_API_KEY = process.env.SMS_API_KEY;
const SENDER_ID = process.env.SENDER_ID;
const ENTITY_ID = process.env.ENTITY_ID;
const TEMPLATE_ID = process.env.TEMPLATE_ID;

/**
 * Send SMS using SMS Gateway Hub
 * @param {string} phone - Phone number (10 digits)
 * @param {string} message - SMS message text
 * @returns {Promise<boolean>} - Success status
 */
const sendSMS = async (phone, message) => {
  try {
    // Validate phone number
    if (!phone || !/^\d{10}$/.test(phone)) {
      throw new Error('Invalid phone number format');
    }

    // Add country code for India
    const fullPhone = `91${phone}`;
    
    // Construct SMS Gateway Hub URL (exactly matching authOtpController format)
    const url = `https://www.smsgatewayhub.com/api/mt/SendSMS?APIKey=${SMS_API_KEY}&senderid=${SENDER_ID}&channel=2&DCS=0&flashsms=0&number=${fullPhone}&text=${encodeURIComponent(message)}&route=clickhere&EntityId=${ENTITY_ID}&dlttemplateid=${TEMPLATE_ID}`;
    
    console.log(`Sending SMS to ${phone}: ${message}`);
    
    // Send SMS (same approach as authOtpController - don't check response details)
    const response = await axios.get(url);
    
    // Simple success - just like the authentication system
    console.log('SMS sent successfully');
    return true;
    
  } catch (error) {
    console.error('Failed to send SMS:', error.message);
    if (error.response) {
      console.error('SMS API Error Response:', error.response.data);
    }
    return false;
  }
};

/**
 * Send delivery OTP to customer
 * @param {string} customerPhone - Customer's phone number
 * @param {string} otp - 4-digit OTP
 * @param {string} orderId - Order ID
 * @returns {Promise<boolean>} - Success status
 */
const sendDeliveryOTP = async (customerPhone, otp, orderId) => {
  // Use the same DLT template as authentication system due to template limitations
  const message = `Use ${otp} as One Time Password (OTP) to Get your Pie Certificates HTL`;
  
  console.log(`Sending delivery OTP to ${customerPhone} for order ${orderId} using auth template`);
  return await sendSMS(customerPhone, message);
};

module.exports = {
  sendSMS,
  sendDeliveryOTP
};