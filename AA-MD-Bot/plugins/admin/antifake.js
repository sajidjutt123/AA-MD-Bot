// ============================================
// AA MD Bot - Anti Fake Numbers (Group)
// Developer: Ahsan Ali | AA Mods
// ============================================

import { db } from '../../lib/database.js';

// All valid country calling codes
const VALID_CODES = [
  '1','7','20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49',
  '51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86',
  '90','91','92','93','94','95','98','212','213','216','218','220','221','222','223','224','225',
  '226','227','228','229','230','231','232','233','234','235','236','237','238','239','240','241',
  '242','243','244','245','246','247','248','249','250','251','252','253','254','255','256','257',
  '258','260','261','262','263','264','265','266','267','268','269','290','291','297','298','299',
  '350','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375',
  '376','377','378','380','381','382','385','386','387','389','420','421','423','500','501','502',
  '503','504','505','506','507','508','509','590','591','592','593','594','595','596','597','598',
  '670','672','673','674','675','676','677','678','679','680','681','682','683','685','686','687',
  '688','689','690','691','692','850','852','853','855','856','880','886','960','961','962','963',
  '964','965','966','967','968','970','971','972','973','974','975','976','977','992','993','994',
  '995','996','998',
];

function hasValidCode(num) {
  // Sort codes longest first for greedy match
  const sorted = [...VALID_CODES].sort((a,b) => b.length - a.length);
  return sorted.some(code => num.startsWith(code));
}

// Called passively from sessionManager on group participant add
export async function checkAntiFake(update, sock, sessionId) {
  const { id: chatJid, participants, action } = update;
  if (action !== 'add') return;

  const grp = db.groups.get(sessionId, chatJid) || {};
  if (!grp.antifake) return;

  const fakes = participants.filter(p => {
    const num = p.replace(/\D/g,'').replace(/@.*/,'');
    return !hasValidCode(num);
  });

  for (const fake of fakes) {
    try {
      await sock.sendMessage(chatJid, {
        text: `🚫 *Anti Fake Removed:* @${fake.split('@')[0]}\nInvalid/fake number detected.\n\n> 🤖 *AA MD Bot*`,
        mentions: [fake],
      });
      await sock.groupParticipantsUpdate(chatJid, [fake], 'remove');
    } catch {}
  }
}

export default {
  command: 'antifake',
  alias: ['fakeno'],
  description: 'Toggle anti-fake number filter — kicks members with invalid phone numbers',
  category: 'admin',
  groupOnly: true,
  adminOnly: true,

  async execute({ jid, args, reply, react, db }) {
    const sub = (args[0] || '').toLowerCase().trim();
    const grp = db.groups.get(jid) || {};

    if (!sub || sub === 'status') {
      return reply(
        `🚫 *Anti Fake Numbers*\n\n` +
        `Status: *${grp.antifake ? '✅ ON' : '❌ OFF'}*\n\n` +
        `📌 When enabled, users with invalid/fake phone numbers are auto-kicked on join.\n\n` +
        `📋 *.antifake on* / *.antifake off*\n\n` +
        `> 🤖 *AA MD Bot*`
      );
    }

    if (sub === 'on') {
      grp.antifake = true; db.groups.set(jid, grp); await react('✅');
      return reply(`✅ *Anti Fake enabled!*\nFake numbers will be auto-kicked.\n\n> 🤖 *AA MD Bot*`);
    }
    if (sub === 'off') {
      grp.antifake = false; db.groups.set(jid, grp); await react('❌');
      return reply(`❌ *Anti Fake disabled.*\n\n> 🤖 *AA MD Bot*`);
    }
  },
};
