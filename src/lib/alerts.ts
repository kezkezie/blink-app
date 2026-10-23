/**
 * Alerts to the owner's phone (Kezie, 2026-10-23: "I'll need you to be alert"): a Telegram message
 * from a bot, when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set (BotFather gives the token; the
 * chat id is the owner's chat with the bot). Without them it only logs. Never throws, never blocks.
 * Used for things that need a person soon: a card dispute (Paystack gives 16 hours to answer).
 */
export async function sendAlert(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  console.warn(`[alert] ${text}`);
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok;
  } catch { return false; }
}
