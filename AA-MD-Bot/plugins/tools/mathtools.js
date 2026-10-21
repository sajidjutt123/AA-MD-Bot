// ============================================
// AA MD Bot - Math Tools
// All calculations — no API needed
// Commands: .calc .sqrt .power .factorial
//   .average .percentage .fibonacci .prime
//   .convert .compound .age .hexdec
// ============================================

function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) if (n % i === 0) return false;
  return true;
}

export default {
  command: 'calc',
  alias: ['sqrt',  'squareroot',  'power',  'pow',  'exponent',  'factorial',  'average',  'avg',  'mean',  'percentage',  'percent',  'pct',  'fibonacci',  'fib',  'prime',  'isprime',  'unitconvert',  'compound',  'interest',  'age',  'agecalc',  'hexdec',  'hex2dec',  'dechex',  'dec2hex',  'log',  'logarithm',  'gcd',  'lcm',  'random',  'rand',  'math',  'calculate'],
  description: 'Full math toolkit — calculator, converters, number theory',
  category: 'tools',

  async execute({ command, args, text, reply, prefix }) {
    const a = args.map(Number);

    // ── calc / safe eval ───────────────────────────────
    if (command === 'calc') {
      if (!text) return reply(`🧮 *Calculator*\n\n${prefix}calc 25 * 4 + (10 / 2)\n\n_Supported: + - * / % ** sqrt() round()_`);
      try {
        const expr = text.replace(/[^0-9+\-*/().\s%^sqrt]/gi, '').replace(/\^/g,'**');
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${expr})`)();
        if (!isFinite(result)) throw new Error('Result is not finite');
        return reply(`🧮 *${text}* = *${result}*\n\n> 🧮 *AA MD Bot*`);
      } catch { return reply(`❌ Invalid expression: \`${text}\`\n\n> 🧮 *AA MD Bot*`); }
    }

    // ── sqrt ───────────────────────────────────────────
    if (command === 'sqrt' || command === 'squareroot') {
      const n = parseFloat(args[0]);
      if (isNaN(n) || n < 0) return reply(`*Usage:* ${prefix}sqrt <number>\n${prefix}sqrt 144`);
      return reply(`√${n} = *${Math.sqrt(n).toFixed(6)}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── power / exponent ───────────────────────────────
    if (['power','pow','exponent'].includes(command)) {
      if (isNaN(a[0]) || isNaN(a[1])) return reply(`*Usage:* ${prefix}power <base> <exp>\n${prefix}power 2 10`);
      return reply(`${a[0]}^${a[1]} = *${Math.pow(a[0], a[1])}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── factorial ──────────────────────────────────────
    if (command === 'factorial') {
      const n = parseInt(args[0]);
      if (isNaN(n) || n < 0 || n > 170) return reply(`*Usage:* ${prefix}factorial <0-170>`);
      let r = BigInt(1);
      for (let i = 2; i <= n; i++) r *= BigInt(i);
      return reply(`${n}! = *${r.toString()}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── average / mean ─────────────────────────────────
    if (['average','avg','mean'].includes(command)) {
      const nums = a.filter(n => !isNaN(n));
      if (!nums.length) return reply(`*Usage:* ${prefix}average 10 20 30 40`);
      const avg = nums.reduce((s,n) => s+n, 0) / nums.length;
      return reply(`📊 Average of [${nums.join(', ')}] = *${avg.toFixed(4)}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── percentage ─────────────────────────────────────
    if (['percentage','percent','pct'].includes(command)) {
      if (args.length < 2) return reply(`*Usage:* ${prefix}percentage <value> <total>\n${prefix}percentage 30 120`);
      if (a[1] === 0) return reply(`❌ Cannot divide by zero.`);
      return reply(`📊 ${a[0]} of ${a[1]} = *${((a[0]/a[1])*100).toFixed(2)}%*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── fibonacci ──────────────────────────────────────
    if (['fibonacci','fib'].includes(command)) {
      const n = Math.min(parseInt(args[0]) || 10, 70);
      const seq = [0n, 1n];
      for (let i = 2; i < n; i++) seq.push(seq[i-1] + seq[i-2]);
      return reply(`🔢 *Fibonacci (${n} terms)*\n\n${seq.slice(0,n).map(String).join(', ')}\n\n> 🧮 *AA MD Bot*`);
    }

    // ── prime / isprime ────────────────────────────────
    if (['prime','isprime'].includes(command)) {
      const n = parseInt(args[0]);
      if (isNaN(n)) return reply(`*Usage:* ${prefix}prime <number>`);
      return reply(`${n} is ${isPrime(n) ? '✅ *a prime number*' : '❌ *not prime*'}\n\n> 🧮 *AA MD Bot*`);
    }

    // ── unit convert ───────────────────────────────────
    if (['convert','unitconvert'].includes(command)) {
      const val  = parseFloat(args[0]);
      const from = (args[1]||'').toLowerCase();
      const to   = (args[2]||'').toLowerCase();
      if (isNaN(val) || !from || !to) return reply(
        `📐 *Unit Converter*\n\n${prefix}convert <value> <from> <to>\n\n` +
        `*Supported:* km/mi, kg/lb, cm/in/m/ft, l/gal, °c/°f\n\n` +
        `*Examples:*\n• ${prefix}convert 100 km mi\n• ${prefix}convert 70 kg lb\n• ${prefix}convert 37 c f`
      );
      const convs = {
        km:{mi:0.621371,m:1000,ft:3280.84},mi:{km:1.60934,m:1609.34},
        kg:{lb:2.20462,g:1000},lb:{kg:0.453592},g:{kg:0.001},
        cm:{in:0.393701,m:0.01,mm:10},in:{cm:2.54,m:0.0254},m:{ft:3.28084,cm:100,km:0.001},ft:{m:0.3048},
        l:{gal:0.264172,ml:1000},gal:{l:3.78541},ml:{l:0.001},
      };
      if (from === 'c' && to === 'f') return reply(`🌡️ ${val}°C = *${(val*9/5+32).toFixed(2)}°F*\n\n> 🧮 *AA MD Bot*`);
      if (from === 'f' && to === 'c') return reply(`🌡️ ${val}°F = *${((val-32)*5/9).toFixed(2)}°C*\n\n> 🧮 *AA MD Bot*`);
      const factor = convs[from]?.[to];
      if (!factor) return reply(`❌ Unknown conversion: ${from} → ${to}\n\nSupported: km/mi, kg/lb, cm/in, l/gal, °c/°f`);
      return reply(`📐 ${val} ${from} = *${(val*factor).toFixed(4)} ${to}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── compound interest ──────────────────────────────
    if (['compound','interest'].includes(command)) {
      if (args.length < 3) return reply(`${prefix}compound <principal> <rate%> <years>\n${prefix}compound 10000 8 5`);
      const [p, r, t] = [a[0], a[1], a[2]];
      const amt = p * Math.pow(1 + r/100, t);
      return reply(
        `💰 *Compound Interest*\n\n` +
        `Principal: $${p.toLocaleString()}\nRate: ${r}%/year\nYears: ${t}\n\n` +
        `Final Amount: *$${amt.toFixed(2)}*\nProfit: *$${(amt-p).toFixed(2)}*\n\n> 💰 *AA MD Bot*`
      );
    }

    // ── age ────────────────────────────────────────────
    if (['age','agecalc'].includes(command)) {
      if (!text) return reply(`${prefix}age <date>\n${prefix}age 1995-06-15`);
      const d = new Date(text.trim());
      if (isNaN(d)) return reply(`❌ Invalid date. Use format: YYYY-MM-DD`);
      const now = new Date();
      let years = now.getFullYear() - d.getFullYear();
      if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) years--;
      const days = Math.floor((now - d) / 86400000);
      return reply(
        `🎂 *Age Calculator*\n\n` +
        `Born: ${d.toDateString()}\n` +
        `Age: *${years} years*\n` +
        `Days lived: *${days.toLocaleString()}*\n\n> 🎂 *AA MD Bot*`
      );
    }

    // ── hex2dec / dec2hex ──────────────────────────────
    if (['hex2dec','hexdec'].includes(command)) {
      if (!text) return reply(`${prefix}hex2dec <hex>\n${prefix}hex2dec FF`);
      return reply(`0x${text.trim().toUpperCase()} = *${parseInt(text.trim(), 16)}*\n\n> 🧮 *AA MD Bot*`);
    }
    if (['dec2hex','dechex'].includes(command)) {
      const n = parseInt(args[0]);
      if (isNaN(n)) return reply(`${prefix}dec2hex <number>\n${prefix}dec2hex 255`);
      return reply(`${n} = *0x${n.toString(16).toUpperCase()}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── log ────────────────────────────────────────────
    if (['log','logarithm'].includes(command)) {
      const n = parseFloat(args[0]), base = parseFloat(args[1]) || Math.E;
      if (isNaN(n) || n <= 0) return reply(`${prefix}log <number> [base]\n${prefix}log 1000 10`);
      return reply(`📊 log${args[1] ? args[1] : 'e'}(${n}) = *${(Math.log(n)/Math.log(base)).toFixed(8)}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── gcd / lcm ──────────────────────────────────────
    if (command === 'gcd') {
      const nums = a.map(Math.abs).map(Math.round).filter(n => n > 0);
      if (nums.length < 2) return reply(`${prefix}gcd <a> <b>\n${prefix}gcd 48 18`);
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const r = nums.reduce(gcd);
      return reply(`🔢 GCD(${nums.join(', ')}) = *${r}*\n\n> 🧮 *AA MD Bot*`);
    }
    if (command === 'lcm') {
      const nums = a.map(Math.abs).map(Math.round).filter(n => n > 0);
      if (nums.length < 2) return reply(`${prefix}lcm <a> <b>\n${prefix}lcm 12 18`);
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const lcm = (a, b) => (a / gcd(a, b)) * b;
      const r = nums.reduce(lcm);
      return reply(`🔢 LCM(${nums.join(', ')}) = *${r}*\n\n> 🧮 *AA MD Bot*`);
    }

    // ── random ─────────────────────────────────────────
    if (['random','rand'].includes(command)) {
      const min = parseInt(args[0]) || 1, max = parseInt(args[1]) || 100;
      return reply(`🎲 Random (${min}-${max}): *${Math.floor(Math.random()*(max-min+1))+min}*\n\n> 🎲 *AA MD Bot*`);
    }

    // ── fallback help ──────────────────────────────────
    reply(
      `🧮 *Math Tools*\n\n` +
      `• ${prefix}calc 25 * 4\n` +
      `• ${prefix}sqrt 144\n` +
      `• ${prefix}power 2 10\n` +
      `• ${prefix}factorial 10\n` +
      `• ${prefix}average 10 20 30\n` +
      `• ${prefix}percentage 30 120\n` +
      `• ${prefix}fibonacci 15\n` +
      `• ${prefix}prime 17\n` +
      `• ${prefix}convert 100 km mi\n` +
      `• ${prefix}compound 10000 8 5\n` +
      `• ${prefix}age 1995-06-15\n` +
      `• ${prefix}hex2dec FF\n` +
      `• ${prefix}gcd 48 18  •  ${prefix}lcm 12 18\n` +
      `• ${prefix}random 1 100\n\n` +
      `> 🧮 *AA MD Bot*`
    );
  },
};
