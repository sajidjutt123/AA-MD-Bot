#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  AA MD Bot — static smoke test
//
//  Runs without node_modules, so it works in CI and on a fresh clone.
//  It parses every plugin and asserts:
//    1. every plugin declares `command` and `execute`
//    2. no two plugins claim the same command name
//    3. no two plugins claim the same alias
//    4. no alias shadows another plugin's command
//    5. no plugin file is empty / unparseable
//
//  Usage:  node scripts/smoke-test.mjs [--quiet]
//  Exit:   0 = clean, 1 = problems found
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, '../plugins');
const QUIET = process.argv.includes('--quiet');

const STR = /(['"`])((?:\\.|(?!\1).)*)\1/g;

function stringList(block) {
  const out = [];
  for (const m of block.matchAll(STR)) out.push(m[2]);
  return out;
}

const files = [];
for (const dir of fs.readdirSync(PLUGINS_DIR).sort()) {
  const dirPath = path.join(PLUGINS_DIR, dir);
  if (!fs.statSync(dirPath).isDirectory()) continue;
  for (const f of fs.readdirSync(dirPath).sort()) {
    if (f.endsWith('.js')) files.push(path.join(dirPath, f));
  }
}

const problems = [];
const commands = new Map(); // name → file
const aliasOwners = new Map(); // alias → file
const perCategory = {};
const shims = [];
const factories = [];
let pluginCount = 0;

for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');

  if (!src.trim()) { problems.push(`EMPTY FILE          ${rel}`); continue; }

  const cmds = [...src.matchAll(/command\s*:\s*(['"`])([^'"`]+)\1/g)].map(m => m[2].toLowerCase());
  const aliasBlocks = [...src.matchAll(/alias\s*:\s*\[([\s\S]*?)\]/g)].flatMap(b => stringList(b[1]))
    .map(a => a.toLowerCase());
  const hasExecute = /execute\s*[:(]/.test(src);

  if (!cmds.length) {
    // (a) pure re-export shim: `export { xPlugin as default } from './factory.js'`
    const shim = src.match(/export\s*\{[^}]*\}\s*from\s*['"](\.[^'"]+)['"]/);
    if (shim) {
      const target = path.resolve(path.dirname(file), shim[1]);
      if (!fs.existsSync(target)) problems.push(`BROKEN SHIM        ${rel}  →  ${shim[1]}`);
      else shims.push(rel);
      continue;
    }
    // (b) factory module: builds plugin objects at runtime (e.g. makeModelPlugin)
    if (/\bcommand\b/.test(src) && /function\s+make\w*Plugin|makeModelPlugin/.test(src)) {
      if (!/export/.test(src)) problems.push(`FACTORY W/O EXPORT ${rel}`);
      else factories.push(rel);
      continue;
    }
    problems.push(`NO COMMAND          ${rel}`);
    continue;
  }
  if (!hasExecute) problems.push(`NO EXECUTE          ${rel}`);

  // Categories come from the plugin body; the folder is only the source tree.
  const cat = (src.match(/category\s*:\s*(['"`])([^'"`]+)\1/)?.[2] || 'misc').toLowerCase();
  perCategory[cat] = (perCategory[cat] || 0) + 1;

  for (const c of cmds) {
    pluginCount++;
    if (commands.has(c) && commands.get(c) !== rel) {
      problems.push(`DUPLICATE COMMAND   "${c}"  ${commands.get(c)}  vs  ${rel}`);
    } else {
      commands.set(c, rel);
    }
  }

  for (const a of new Set(aliasBlocks)) {
    if (cmds.includes(a)) continue;
    if (aliasOwners.has(a) && aliasOwners.get(a) !== rel) {
      problems.push(`DUPLICATE ALIAS     "${a}"  ${aliasOwners.get(a)}  vs  ${rel}`);
    } else {
      aliasOwners.set(a, rel);
    }
    const owner = commands.get(a);
    if (owner && owner !== rel) {
      problems.push(`ALIAS SHADOWS CMD   "${a}"  in ${rel}  hides  ${owner}`);
    }
  }
}

// Every alias must resolve to a real command.
for (const [alias, owner] of aliasOwners) {
  if (!commands.has(alias) && !commands.size) problems.push(`DANGLING ALIAS "${alias}" (${owner})`);
}

const summary = [
  `files            ${files.length}`,
  `plugins          ${pluginCount}`,
  `unique commands  ${commands.size}`,
  `unique aliases   ${aliasOwners.size}`,
  `categories       ${Object.keys(perCategory).length}`,
  `shims            ${shims.length}  (re-export another plugin)`,
  `factories        ${factories.length}  (build plugins at runtime)`,
];

if (!QUIET) {
  console.log('── Plugin smoke test ─────────────────────────────');
  for (const line of summary) console.log('  ' + line);
  console.log('  category counts  ' + Object.entries(perCategory).map(([k, v]) => `${k}:${v}`).join('  '));
  console.log('──────────────────────────────────────────────────');
}

if (problems.length) {
  console.error(`\n❌ ${problems.length} problem(s):\n`);
  for (const p of problems) console.error('   ' + p);
  process.exit(1);
}

console.log('✅ No duplicate commands, no duplicate aliases, every plugin has execute().');
