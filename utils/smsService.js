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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || '';
const NOTIFY_ENABLED = !!(BOT_TOKEN && CHAT_ID);

/**
 * Send a message via Telegram Bot API
 * @param {string} text - Message text (supports Markdown)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendTelegram(text) {
  if (!NOTIFY_ENABLED) {
    console.log(`[Telegram] Notifications disabled (no token/chat). Would have sent:\n${text}`);
    return { success: false, message: 'Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env' };
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();

    if (data.ok) {
      console.log(`[Telegram] ✅ Message sent`);
      return { success: true, message: 'Telegram notification sent' };
    } else {
      console.error(`[Telegram] ❌ Failed:`, data.description);
      return { success: false, message: data.description || 'Telegram send failed' };
    }
  } catch (err) {
    console.error(`[Telegram] ❌ Error:`, err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Send violation alert to Telegram when a student commits a violation
 * @param {Object} student - Student document
 * @param {Object} violation - Violation details (type, fine, description, severity)
 */
async function sendViolationAlert(student, violation) {
  const fineText = violation.fine > 0 ? `₹${violation.fine.toLocaleString('en-IN')}` : 'Nil';
  const sevEmoji = { low: '🟡', medium: '🟠', high: '🔴' }[violation.severity] || '🟠';
  const autoTag  = violation.isAuto ? ' _(Auto-generated)_' : '';
  const parentInfo = student.parentMobile
    ? `\n📱 *Parent Mobile:* ${student.parentMobile}`
    : '';

  const message = [
    `🚨 *VIOLATION ALERT*${autoTag}`,
    ``,
    `👤 *Student:* ${student.name}`,
    `🏠 *Room:* ${student.roomNumber}`,
    `🏢 *Block:* ${student.hostelBlock || 'N/A'}`,
    parentInfo,
    ``,
    `${sevEmoji} *Type:* ${violation.type}`,
    `💰 *Fine:* ${fineText}`,
    `📊 *Severity:* ${violation.severity?.toUpperCase() || 'MEDIUM'}`,
    violation.description ? `📝 *Details:* ${violation.description}` : '',
    ``,
    `⏰ ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`
  ].filter(Boolean).join('\n');

  return sendTelegram(message);
}

module.exports = { sendTelegram, sendViolationAlert, NOTIFY_ENABLED };
