// ============================================
// AA MD Bot - Anti ViewOnce Toggle
// Developer: Ahsan Ali | AA Mods
//
// Enables/disables automatic view-once reveal.
// GLOBAL: works for ALL chats (groups + DMs).
// Always sets the global antiViewOnce flag so
// that view-once from ANY number auto-forwards
// to the owner's "You" chat.
// ============================================
import { saveNow } from '../../lib/database.js';
export default {
  command: "antiviewonce",
  alias: ["antivo", "aviewonce", "antivv", "voword", "vokeyword", "voreply"],
  description: "Toggle auto-reveal of view-once media / set the reveal keyword",
  category: "owner",
  ownerOnly: true,
  usage: ".antiviewonce on|off | .voword <keyword> | .voword off",
  async execute({ args, reply, db, isGroupMsg, jid, command }) {
    // ── .voword <keyword> — the reply-to-reveal keyword ──────────────────────
    // Previously this setting had no writer, so the trigger was permanently
    // inert. `voKeyword` is read by antiViewOnce.handleReplyReveal().
    if (command === "voword" || command === "vokeyword") {
      const keyword = args.join(" ").trim();
      const current = db.settings.getValue("voKeyword");

      if (!keyword) {
        return reply(
          `🔑 *View-Once Reveal Keyword*\n\n` +
          `Current: *${current || "not set"}*\n\n` +
          `📋 *Usage:*\n` +
          `• *.voword show*   — set the keyword to "show"\n` +
          `• *.voword off*    — remove the keyword\n\n` +
          `When set, replying to a view-once with *${current || "<keyword>"}*\n` +
          `reveals the media. (4 same emojis always work.)\n\n` +
          `> 👁️ *AA MD Bot*`
        );
      }

      if (/^(off|clear|none|reset|disable)$/i.test(keyword)) {
        db.settings.setValue("voKeyword", null);
        await saveNow('settings').catch(() => {});
        return reply(`❌ Reveal keyword cleared.\n\n4 same emojis still reveal.\n\n> 👁️ *AA MD Bot*`);
      }

      if (keyword.length > 40) {
        return reply("❌ Keyword too long — 40 characters max.");
      }

      db.settings.setValue("voKeyword", keyword);
      await saveNow('settings').catch(() => {});
      return reply(
        `✅ *Reveal keyword set:* ${keyword}\n\n` +
        `Reply to any view-once message with *${keyword}* to reveal it.\n\n` +
        `> 👁️ *AA MD Bot*`
      );
    }

    // ── .voreply <text|off> — auto-reply sent to whoever posts a view-once ───
    // `voAutoReply` was read by handleViewOnceMessage() with no writer.
    if (command === "voreply") {
      const text = args.join(" ").trim();
      const current = db.settings.getValue("voAutoReply");

      if (!text) {
        return reply(
          `💬 *View-Once Auto-Reply*\n\n` +
          `Current: *${current ? current : "off"}*\n\n` +
          `📋 *Usage:*\n` +
          `• *.voreply Thanks for the view-once!*\n` +
          `• *.voreply off*\n\n` +
          `The bot replies with this text to anyone who sends a view-once.\n\n` +
          `> 👁️ *AA MD Bot*`
        );
      }

      if (/^(off|clear|none|reset|disable)$/i.test(text)) {
        db.settings.setValue("voAutoReply", null);
        await saveNow('settings').catch(() => {});
        return reply(`❌ View-once auto-reply disabled.\n\n> 👁️ *AA MD Bot*`);
      }

      if (text.length > 300) return reply("❌ Too long — 300 characters max.");

      db.settings.setValue("voAutoReply", text);
      await saveNow('settings').catch(() => {});
      return reply(`✅ View-once auto-reply set:\n_${text}_\n\n> 👁️ *AA MD Bot*`);
    }

    const input = (args[0] || "").toLowerCase().trim();
    if (!input || (input !== "on" && input !== "off")) {
      const globalOn = db.settings.getValue("antiViewOnce") === true;
      return reply(
        `👁️ *Anti ViewOnce*\n\n` +
        `Current status: *${globalOn ? "✅ ON" : "❌ OFF"}*\n\n` +
        `📌 *What it does:*\n` +
        `When ANYONE sends a view-once photo/video\n` +
        `(group OR DM), the bot automatically saves\n` +
        `and sends it to your *"You"* chat.\n\n` +
        `📋 *Usage:*\n` +
        `• *.antiviewonce on*  — enable for ALL chats\n` +
        `• *.antiviewonce off* — disable\n` +
        `• *.voword <word>*    — set the reply-reveal keyword (${db.settings.getValue("voKeyword") || "not set"})\n` +
        `• *.voreply <text>*   — auto-reply to view-once senders\n\n` +
        `> 👁️ *AA MD Bot*`,
      );
    }
    const enable = input === "on";
    db.settings.setValue("antiViewOnce", enable);
    saveNow('settings').catch(() => {});
    if (isGroupMsg) {
      db.groups.set(jid, { antiviewonce: enable }); // scopedDb injects sessionId internally — correct as-is
    }
    return reply(
      `${enable ? "✅" : "❌"} *Anti ViewOnce ${enable ? "Enabled" : "Disabled"}*\n\n` +
      `View-once media from *ALL chats* (groups + DMs)\n` +
      `will ${enable ? "now be automatically" : "no longer be"} revealed\n` +
      `to your *"You"* chat.\n\n` +
      `💡 *Tip:* Reply to any view-once with\n` +
      `4 same emojis (e.g. 🔥🔥🔥🔥) to reveal manually.\n\n` +
      `> 👁️ *AA MD Bot*`,
    );
  },
};
