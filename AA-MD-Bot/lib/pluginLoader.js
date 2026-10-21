import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginsDir = path.join(__dirname, '../plugins');

export const plugins = new Map();
export const aliases = new Map();
export const categories = new Map();

// Provenance + collision tracking. Behaviour is still last-write-wins (as it
// always was), but collisions are now reported instead of silently hidden.
const _owners = new Map();      // token → "category/file.js"
export const collisions = [];   // { token, previous, current }

function relPath(filePath) {
  return path.relative(pluginsDir, filePath).replace(/\\/g, '/');
}

function noteCollision(token, previous, current) {
  collisions.push({ token, previous, current });
  logger.warn(
    { token, previous, current },
    '⚠️ Plugin command/alias collision — last one wins'
  );
}

function claim(token, filePath) {
  const current = relPath(filePath);
  const previous = _owners.get(token);
  if (previous && previous !== current) noteCollision(token, previous, current);
  _owners.set(token, current);
}

function registerPlugin(plugin, filePath) {
  if (!plugin?.command) return false;
  const cmds = (Array.isArray(plugin.command) ? plugin.command : [plugin.command])
    .filter(Boolean)
    .map(c => String(c).toLowerCase());

  for (const cmd of cmds) {
    claim(cmd, filePath);
    plugins.set(cmd, plugin);
  }

  if (plugin.alias) {
    const arr = Array.isArray(plugin.alias) ? plugin.alias : [plugin.alias];
    for (const raw of arr) {
      if (!raw) continue;
      const a = String(raw).toLowerCase();
      // An alias must never shadow a real command name.
      if (plugins.has(a) && !cmds.includes(a)) {
        noteCollision(a, _owners.get(a) || 'command', `${relPath(filePath)} (alias)`);
      }
      claim(`${a}#alias`, filePath);
      aliases.set(a, cmds[0]);
    }
  }

  const cat = plugin.category || 'misc';
  if (!categories.has(cat)) categories.set(cat, []);
  const catArr = categories.get(cat);
  if (cmds[0] && !catArr.includes(cmds[0])) catArr.push(cmds[0]);
  return true;
}

export async function loadPlugin(filePath) {
  try {
    const url = pathToFileURL(filePath).href + `?t=${Date.now()}`;
    const mod = await import(url);
    const exported = mod.default || mod;

    // Support array of plugins (e.g. Islamic plugin exports an array)
    if (Array.isArray(exported)) {
      let count = 0;
      for (const plugin of exported) {
        if (registerPlugin(plugin, filePath)) count++;
      }
      return count > 0 ? exported[0] : null;
    }

    // Single plugin object
    return registerPlugin(exported, filePath) ? exported : null;
  } catch (err) {
    logger.warn({ err: err.message, filePath: path.basename(filePath) }, 'Plugin load failed');
    return null;
  }
}

export async function loadAllPlugins() {
  plugins.clear(); aliases.clear(); categories.clear();
  _owners.clear(); collisions.length = 0;

  const dirs = await fs.readdir(pluginsDir).catch(() => []);
  let loaded = 0;
  for (const dir of dirs) {
    const dirPath = path.join(pluginsDir, dir);
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const files = (await fs.readdir(dirPath).catch(() => [])).sort();
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const result = await loadPlugin(path.join(dirPath, file));
      if (result) loaded++;
    }
  }

  if (collisions.length) {
    logger.warn(
      { count: collisions.length, sample: collisions.slice(0, 8) },
      '⚠️ Plugin registry has duplicate command/alias names — run `.reload` after fixing them'
    );
  }

  return loaded;
}

export function getPlugin(name) {
  const cmd = String(name || '').toLowerCase();
  if (plugins.has(cmd)) return plugins.get(cmd);
  if (aliases.has(cmd)) return plugins.get(aliases.get(cmd));
  return null;
}

export function getCategories() {
  const result = {};
  for (const [cat, cmds] of categories) result[cat] = cmds;
  return result;
}

export async function reloadPlugins() { return loadAllPlugins(); }

export default {
  loadAllPlugins, loadPlugin, getPlugin, getCategories, reloadPlugins,
  plugins, aliases, categories, collisions,
};
