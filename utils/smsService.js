/**
 * Notification Service — Telegram Bot Integration
 * 
 * Sends violation alerts to a Telegram group/chat when a student commits a violation.
 * Zero cost, no DLT registration, works instantly.
 * 
 * ── Setup (2 minutes) ──────────────────────────────────────────────────────
 * 1. Open Telegram → search for @BotFather → send /newbot → follow prompts
 * 2. Copy the bot token (looks like: 123456789:ABCdefGhIJKlmNoPQRsTUVwxYZ)
 * 3. Create a Telegram group for violation alerts (e.g. "RoomEase Alerts")
 * 4. Add your bot to that group
 * 5. Send any message in the group, then visit:
 *    https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
 *    Find "chat":{"id": -XXXXXXX} — that negative number is your CHAT_ID
 * 6. Add to your .env file:
 *    TELEGRAM_BOT_TOKEN=your_bot_token
 *    TELEGRAM_CHAT_ID=your_chat_id
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Send a message via Telegram Bot API
 * @param {string} text - Message text (plain text)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendTelegram(text) {
  // Read env vars at call time (not module load) so Render env changes take effect
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const chatId   = process.env.TELEGRAM_CHAT_ID || '';

  if (!botToken || !chatId) {
    console.log(`[Telegram] Notifications disabled (no token/chat). Would have sent:\n${text}`);
    return { success: false, message: 'Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env' };
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`[Telegram] ✅ Message sent to chat ${chatId}`);
      return { success: true, message: 'Telegram notification sent' };
    } else {
      console.error(`[Telegram] ❌ API error:`, JSON.stringify(data));
      return { success: false, message: data.description || 'Telegram send failed' };
    }
  } catch (err) {
    console.error(`[Telegram] ❌ Network error:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Send violation alert to Telegram when a student commits a violation
 * @param {Object} student - Student document
 * @param {Object} violation - Violation details (type, fine, description, severity)
 */
async function sendViolationAlert(student, violation) {
  const fineText = violation.fine > 0 ? `Rs.${violation.fine}` : 'Nil';
  const sevMap = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
  const autoTag = violation.isAuto ? ' (Auto-generated)' : '';

  // Plain text message (no Markdown — avoids parse errors with special characters)
  const lines = [
    `🚨 VIOLATION ALERT${autoTag}`,
    ``,
    `👤 Student: ${student.name}`,
    `🏠 Room: ${student.roomNumber}`,
    `🏢 Block: ${student.hostelBlock || 'N/A'}`,
  ];

  if (student.parentMobile) {
    lines.push(`📱 Parent Mobile: ${student.parentMobile}`);
  }

  lines.push(
    ``,
    `⚠️ Type: ${violation.type}`,
    `💰 Fine: ${fineText}`,
    `📊 Severity: ${sevMap[violation.severity] || 'MEDIUM'}`
  );

  if (violation.description) {
    lines.push(`📝 Details: ${violation.description}`);
  }

  lines.push(``, `⏰ ${new Date().toLocaleString('en-IN')}`);

  const message = lines.join('\n');
  console.log(`[Telegram] Sending violation alert for ${student.name}...`);
  return sendTelegram(message);
}

module.exports = { sendTelegram, sendViolationAlert };
