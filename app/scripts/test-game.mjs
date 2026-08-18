#!/usr/bin/env node
/**
 * Run the pure game-logic tests.
 *
 * These deliberately need nothing from node_modules: `tsc` compiles the pure
 * modules in src/lib to a temp directory and Node's built-in test runner runs
 * the suite against the output. That means the game rules can be verified in
 * any environment with Node and TypeScript, including CI containers and
 * sandboxes where a full install is unavailable.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, cpSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'barxp-game-'));

const SOURCES = [
  'src/lib/safe.ts', 'src/lib/types.ts',
  'src/lib/game/constants.ts', 'src/lib/game/xp.ts', 'src/lib/game/streak.ts',
  'src/lib/game/profile.ts', 'src/lib/game/validation.ts', 'src/lib/game/shop.ts',
  'src/lib/game/goals.ts', 'src/lib/game/achievements.ts', 'src/lib/game/muscles.ts',
];

const tsc = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
try {
  execFileSync(tsc, [
    '--ignoreConfig', '--target', 'es2022', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--outDir', out, '--skipLibCheck', '--strict',
    ...SOURCES,
  ], { cwd: root, stdio: 'inherit' });
} catch {
  console.error('\ntypecheck failed — fix the errors above before the tests can run');
  process.exit(1);
}

writeFileSync(join(out, 'package.json'), '{"type":"module"}\n');

// tsc emits the bundler-style extensionless imports it was given; Node's ESM
// resolver requires explicit ones.
const addExtensions = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { addExtensions(full); continue; }
    if (!name.endsWith('.js')) continue;
    writeFileSync(full, readFileSync(full, 'utf8').replace(/from '(\.\.?\/[^']*)'/g, "from '$1.js'"));
  }
};
addExtensions(out);

cpSync(join(root, 'src/lib/game/__tests__'), join(out, 'game/__tests__'), { recursive: true });

try {
  execFileSync(process.execPath, ['--test', 'game/__tests__/game.test.mjs'], { cwd: out, stdio: 'inherit' });
} catch {
  process.exit(1);
}
