/**
 * SMS Notification Service — Fast2SMS Integration
 * 
 * Sends SMS alerts to parents when a student commits a violation.
 * Requires FAST2SMS_API_KEY environment variable.
 * 
 * Sign up at https://www.fast2sms.com to get a free API key.
 * Free tier allows testing with your own number.
 */

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';
const SMS_ENABLED = !!FAST2SMS_API_KEY;

/**
 * Send an SMS notification via Fast2SMS
 * @param {string} mobileNumber - 10-digit Indian mobile number
 * @param {string} message - SMS body text
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendSMS(mobileNumber, message) {
  if (!SMS_ENABLED) {
    console.log(`[SMS] Service disabled (no API key). Would have sent to ${mobileNumber}: ${message}`);
    return { success: false, message: 'SMS service not configured — set FAST2SMS_API_KEY in .env' };
  }

  // Validate mobile number (basic 10-digit Indian number check)
  const cleaned = String(mobileNumber).replace(/\D/g, '').slice(-10);
  if (cleaned.length !== 10) {
    console.log(`[SMS] Invalid mobile number: ${mobileNumber}`);
    return { success: false, message: 'Invalid mobile number' };
  }

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': FAST2SMS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        route: 'q',                // Quick SMS route (transactional)
        message: message,
        language: 'english',
        flash: 0,
        numbers: cleaned
      })
    });

    const data = await response.json();
    
    if (data.return === true) {
      console.log(`[SMS] ✅ Sent to ${cleaned}: ${message.substring(0, 50)}...`);
      return { success: true, message: 'SMS sent successfully' };
    } else {
      console.error(`[SMS] ❌ Failed:`, data.message || data);
      return { success: false, message: data.message || 'SMS delivery failed' };
    }
  } catch (err) {
    console.error(`[SMS] ❌ Error sending to ${cleaned}:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Send violation alert SMS to a student's parent
 * @param {Object} student - Student document (must have parentMobile)
 * @param {Object} violation - Violation details (type, fine, description)
 */
async function sendViolationAlert(student, violation) {
  const parentMobile = student.parentMobile;
  
  if (!parentMobile) {
    console.log(`[SMS] No parent mobile for ${student.name} — skipping notification`);
    return { success: false, message: 'No parent mobile number on file' };
  }

  const fineText = violation.fine > 0 ? ` Fine: Rs.${violation.fine}.` : '';
  const message = `RoomEase Alert: ${student.name} (Room ${student.roomNumber}) has been issued a violation - ${violation.type}.${fineText} ${violation.description || ''}`.trim();

  return sendSMS(parentMobile, message);
}

module.exports = { sendSMS, sendViolationAlert, SMS_ENABLED };
