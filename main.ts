// Foundry Yard: a three.js tactical FPS entry for threejs-fps-01 (Node 22, standard
// library only). The game is this directory's game/ folder — plain static files the
// browser loads as ES modules, three.js 0.187.0 from an import map — and this program
// hands it in: it copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library (vendor/makefun-threejs.ts, the kit's copy, unchanged).
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program runs twice in the grader and both runs must write the same bytes, so
// it writes nothing but the copies and the dossier, and it refuses to run when the
// input it needs is missing instead of writing a half entry.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

// The gate's own caps (the kit's reference/gate.json): game/ at most 993 files and
// directories and 48 MiB in all, 3 to 4 screenshots of at most 256 KiB each, the
// dossier at most 1.5 MiB with its text capped at 163,840 bytes. Check the inputs
// before copying so a bad tree fails loudly here instead of at the gate.
function countTree(dir) {
  let entries = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      // The gate refuses symlinks in game/: fail here instead of shipping one.
      if (lstatSync(path).isSymbolicLink()) fail(`${path} is a symlink, the gate takes plain files only`);
      const stat = statSync(path);
      entries += 1;
      if (stat.isDirectory()) stack.push(path);
      else bytes += stat.size;
    }
  }
  return { entries, bytes };
}

if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
if (!existsSync(join(gameDir, 'vendor', 'three', 'three.module.min.js'))) fail('game/vendor/three/three.module.min.js is missing');
if (!existsSync(join(gameDir, 'vendor', 'three', 'three.core.min.js'))) fail('game/vendor/three/three.core.min.js is missing');

const gameSize = countTree(gameDir);
if (gameSize.entries > 993) fail(`game/ holds ${gameSize.entries} entries, over the gate's 993`);
if (gameSize.bytes > 48 * 1024 * 1024) fail(`game/ holds ${gameSize.bytes} bytes, over the gate's 48 MiB`);

const shots = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')) : [];
if (shots.length < 3 || shots.length > 4) fail(`screenshots/ holds ${shots.length} images, the gate wants 3 or 4`);
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > 256 * 1024) fail(`screenshots/${name} is ${size} bytes, over the gate's 256 KiB`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`main.ts: game/ ${gameSize.entries} entries, ${gameSize.bytes} bytes; screenshots/ ${shots.length} images; dossier.json ${dossierBytes} bytes -> ${out}`);
