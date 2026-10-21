// ============================================
// AA MD Bot - Auto Status Saver Plugin
// Developer: Ahsan Ali | AA Mods
// Toggle status auto-save & forwarding to owner DM
// ============================================

export default {
  command: 'autostatus',
  alias: ['stvsave', 'statusview', 'statusreact', 'autosv'],
  description: 'Auto save & forward status updates to owner DM',
  category: 'owner',
  ownerOnly: true,
  usage: '.autostatus on/off',

  async execute({ reply, args, command, db, config }) {
    const toggle = args[0]?.toLowerCase();
    const cmd = command.toLowerCase();

    // Handle statusview and statusreact sub-commands
    if (cmd === 'statusview') {
      const cur = db.settings.getValue('autoStatusView') ?? config.autoStatusView ?? true;
      if (!toggle || !['on', 'off'].includes(toggle)) {
        return reply(`👁️ *Auto Status View* is *${cur ? 'ON ✅' : 'OFF ❌'}*\n\nUsage: *.statusview on/off*\nWhen ON, the bot silently views all contact statuses.`);
      }
      const val = toggle === 'on';
      db.settings.setValue('autoStatusView', val);
      return reply(`👁️ Auto Status View is now *${val ? 'ON ✅' : 'OFF ❌'}*`);
    }

    if (cmd === 'statusreact') {
      const cur = db.settings.getValue('autoStatusReact') ?? config.autoStatusReact ?? true;
      const emoji = db.settings.getValue('statusEmoji') ?? config.statusEmoji ?? '❤️';

      // `.statusreact 🔥` — set the reaction emoji (statusEmoji had no writer,
      // so this setting was previously stuck on the default forever).
      if (toggle && !['on', 'off'].includes(toggle)) {
        if (/^(emoji|set)$/i.test(toggle)) {
          return reply(`Usage: *.statusreact <emoji>*  e.g. *.statusreact 🔥*\n\nCurrent: ${emoji}`);
        }
        const chars = [...args[0]];
        if (chars.length > 4) {
          return reply(`❌ Send a single emoji, e.g. *.statusreact 🔥*`);
        }
        db.settings.setValue('statusEmoji', args[0]);
        return reply(`✅ Status reaction emoji set to *${args[0]}*\n\n> 📸 *AA MD Bot*`);
      }

      if (!toggle) {
        return reply(
          `${emoji} *Auto Status React* is *${cur ? 'ON ✅' : 'OFF ❌'}*\n\n` +
          `Reacts to statuses with: ${emoji}\n\n` +
          `Usage:\n` +
          `• *.statusreact on/off*\n` +
          `• *.statusreact 🔥*   — change the emoji`
        );
      }
      const val = toggle === 'on';
      db.settings.setValue('autoStatusReact', val);
      return reply(`${emoji} Auto Status React is now *${val ? 'ON ✅' : 'OFF ❌'}*`);
    }

    // Main autostatus command
    const current = db.settings.getValue('autoStatus') ?? false;
    const viewOn  = db.settings.getValue('autoStatusView')  ?? config.autoStatusView  ?? true;
    const reactOn = db.settings.getValue('autoStatusReact') ?? config.autoStatusReact ?? true;
    const emoji   = db.settings.getValue('statusEmoji')     ?? config.statusEmoji     ?? '❤️';

    if (!toggle || !['on', 'off'].includes(toggle)) {
      return reply(
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `  📸  *AUTO STATUS SAVER*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💾 *Save & Forward:* ${current  ? '✅ ON' : '❌ OFF'}\n` +
        `👁️ *Auto View:*      ${viewOn   ? '✅ ON' : '❌ OFF'}\n` +
        `${emoji} *Auto React:*     ${reactOn  ? '✅ ON' : '❌ OFF'}\n\n` +
        `━━━━━━ *Commands* ━━━━━━\n` +
        `*.autostatus on/off*   — Toggle status saving\n` +
        `*.statusview on/off*   — View statuses silently\n` +
        `*.statusreact on/off* — React to statuses\n` +
        `*.statusreact 🔥*      — Change reaction emoji\n\n` +
        `💡 When ON, every contact's status is forwarded to your own DM.`
      );
    }

    const value = toggle === 'on';
    db.settings.setValue('autoStatus', value);
    return reply(
      `📸 *Auto Status Saver* is now *${value ? 'ON ✅' : 'OFF ❌'}*\n\n` +
      (value
        ? `All status updates from your contacts will be forwarded to your DM automatically.`
        : `Status forwarding disabled.`)
    );
  },
};
