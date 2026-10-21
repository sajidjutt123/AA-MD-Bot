// ═══════════════════════════════════════════════════════════════════
//  AA MD Bot — ffmpeg runner
//
//  Every media plugin used to build a *shell string* and hand it to
//  `exec()`, e.g.
//      exec(`ffmpeg -i "${inputPath}" -vf "scale=${width}:${height}" "${out}"`)
//  Even where the interpolated values happened to be bot-generated, that
//  pattern is one careless change away from command injection.
//
//  `runFfmpeg()` takes an argument array instead — no shell, no quoting,
//  no substitution. execFile is also cheaper than exec (no /bin/sh fork).
// ═══════════════════════════════════════════════════════════════════

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Run ffmpeg with an argv array.
 * @param {string[]} args      e.g. ['-y', '-i', inPath, '-vf', 'hue=s=0', outPath]
 * @param {number}   timeout   ms before the child is killed (default 30 s)
 */
export async function runFfmpeg(args, timeout = 30_000) {
  if (!Array.isArray(args)) {
    throw new TypeError('runFfmpeg expects an argument array, not a command string');
  }
  return execFileAsync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], {
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export default { runFfmpeg, FFMPEG };
