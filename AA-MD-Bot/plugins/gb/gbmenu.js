export default {
  command: 'gbmenu',
  alias: ['gb', 'gbfeatures', 'gbwhatsapp'],
  category: 'gb',
  description: 'GB WhatsApp-like features menu',
  usage: '.gbmenu',

  async execute({ reply, sock, jid, msg, prefix, db }) {
    const p = prefix || '.';
    const W = `\n\n> 🤖 *Powered by AA MD Bot*  👨‍💻 *Ahsan Ali Wadani*`;

    const menu =
      `╔══════════════════════════════════╗\n` +
      `║  📱  *GB WHATSAPP FEATURES*      ║\n` +
      `║       AA MD Bot  v3.0            ║\n` +
      `╚══════════════════════════════════╝\n\n` +
      `GB WhatsApp-like features, right through\nthe bot!\n\n` +

      `╭─── 👻  *PRIVACY & STEALTH*\n` +
      `│  ▸ *${p}ghost on/off*\n` +
      `│     Appear offline while bot stays active\n` +
      `│\n` +
      `│  ▸ *${p}alwaysonline on/off*\n` +
      `│     Always appear online\n` +
      `│\n` +
      `│  ▸ *${p}privacy*\n` +
      `│     Control last seen, profile pic,\n` +
      `│     blue ticks\n` +
      `│\n` +
      `│  ▸ *${p}privacy lockdown*\n` +
      `│     Hide everything with one command\n` +
      `│\n` +
      `│  ▸ *${p}privacy bluetick on/off*\n` +
      `│     Toggle blue ticks on/off\n` +
      `│\n` +
      `│  ▸ *${p}fls 8:30pm*  /  *${p}fls 20:30*\n` +
      `│     Set a custom last seen time 🕐\n` +
      `│     Bot goes offline at that exact time daily\n` +
      `│     Setting persists across bot restarts\n` +
      `│  ▸ *${p}fls status*  /  *${p}fls off*\n` +
      `│\n` +
      `│  ▸ *${p}anticall on/off*\n` +
      `│     Block incoming calls\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `╭─── 🔓  *VIEW-ONCE & DELETE*\n` +
      `│  ▸ *${p}antiviewonce on/off*\n` +
      `│     Auto-reveal ALL view-once → "You"\n` +
      `│\n` +
      `│  ▸ *Reply with 4 same emojis*\n` +
      `│     e.g. 🔥🔥🔥🔥 on a view-once\n` +
      `│     Reveals it to your "You" chat\n` +
      `│\n` +
      `│  ▸ *${p}avv* (reply to view-once)\n` +
      `│     Manual reveal command\n` +
      `│\n` +
      `│  ▸ *${p}antidelete on/off*\n` +
      `│     Recover deleted messages\n` +
      `│     (works in both DMs and Groups)\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `╭─── 💾  *SAVE & DOWNLOAD*\n` +
      `│  ▸ *${p}statussave* (forward a status)\n` +
      `│     Save anyone's status\n` +
      `│\n` +
      `│  ▸ *${p}pp <number>*\n` +
      `│     View anyone's full profile picture\n` +
      `│     Example: ${p}pp 923001234567\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `╭─── 🤖  *AUTO FEATURES*\n` +
      `│  ▸ *${p}autoreply <message>*\n` +
      `│     Auto reply when you're busy\n` +
      `│     Example: ${p}autoreply I'm busy right now\n` +
      `│\n` +
      `│  ▸ *${p}autoreply off*\n` +
      `│     Turn off auto reply\n` +
      `│\n` +
      `│  ▸ *${p}autoreply status*\n` +
      `│     View the current auto reply message\n` +
      `│\n` +
      `│  ▸ *${p}autoread on/off*\n` +
      `│     Silently read all messages\n` +
      `│\n` +
      `│  ▸ *${p}statusview on/off*\n` +
      `│     Auto-view all statuses\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `╭─── 📅  *MESSAGING TOOLS*\n` +
      `│  ▸ *${p}schedule 5m <message>*\n` +
      `│     Send a message after a delay\n` +
      `│     Example: ${p}schedule 10m Hello!\n` +
      `│\n` +
      `│  ▸ *${p}flood 5 <message>*\n` +
      `│     Send a message N times 👑\n` +
      `│\n` +
      `│  ▸ *${p}typing <seconds>*\n` +
      `│     Show fake typing indicator\n` +
      `│\n` +
      `│  ▸ *${p}recording <seconds>*\n` +
      `│     Show fake recording indicator\n` +
      `│\n` +
      `│  ▸ *${p}broadcast <message>* 👑\n` +
      `│     Send a message to all groups\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `╭─── 👁️  *TRACKING & ALERTS*\n` +
      `│  ▸ *${p}onlinealert <number>*\n` +
      `│     Get alerted when someone comes online\n` +
      `│     Example: ${p}onlinealert 923001234567\n` +
      `│\n` +
      `│  ▸ *${p}onlinealert list*\n` +
      `│     View tracked contacts\n` +
      `│\n` +
      `│  ▸ *${p}onlinealert clear*\n` +
      `│     Remove all alerts\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `╭─── 🎭  *GROUP FEATURES*\n` +
      `│  ▸ *${p}antibot on/off*    — Block other bots\n` +
      `│  ▸ *${p}antilink on/off*   — Block links\n` +
      `│  ▸ *${p}antidelete on/off* — Recover deletes\n` +
      `│  ▸ *${p}antiviewonce on/off* — View-once reveal\n` +
      `╰${'─'.repeat(34)}\n\n` +

      `> 👑 *Commands marked 👑 are owner-only*\n` +
      `> 💡 *Type any command with no args to see its usage guide*` +
      W;

    return sock.sendMessage(jid, { text: menu }, { quoted: msg });
  },
};
