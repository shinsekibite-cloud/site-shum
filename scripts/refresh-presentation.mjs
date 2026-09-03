/**
 * Refresh presentation packs.
 * Usage: FORCE_SEED=1 node scripts/refresh-presentation.mjs
 */
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
if (!env.FORCE_SEED) env.FORCE_SEED = '0';

const pack = spawnSync('bash', [join(ROOT, 'scripts', 'pack-presentation.sh')], {
  cwd: ROOT,
  encoding: 'utf8',
  env,
});
if (pack.stdout) process.stdout.write(pack.stdout);
if (pack.stderr) process.stderr.write(pack.stderr);
process.exit(pack.status || 0);
