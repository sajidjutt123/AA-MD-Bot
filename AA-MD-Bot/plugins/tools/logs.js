import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '../../logs');

export default {
  command: 'logs',
  alias: ['viewlogs'],
  description: 'View recent bot logs',
  category: 'tools',
  ownerOnly: true,
  superOwnerOnly: true,
  async execute({ reply, args }) {
    const lines = Math.min(parseInt(args[0]) || 20, 50);
    try {
      const logFile = path.join(logsDir, 'bot.log');
      const exists = await fs.pathExists(logFile);
      if (!exists) return reply('📋 No logs found yet.');
      const content = await fs.readFile(logFile, 'utf8');
      const allLines = content.trim().split('\n');
      const recent = allLines.slice(-lines);
      reply(`📋 *Recent Logs (${recent.length} lines)*\n\n\`\`\`${recent.join('\n').substring(0, 3000)}\`\`\``);
    } catch (err) {
      reply('❌ Failed to read logs. Please try again in a few seconds.');
    }
  },
};
