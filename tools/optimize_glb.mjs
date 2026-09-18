import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(root, process.argv[2] || 'public/assets/kit');
const manifest = JSON.parse(readFileSync(join(assetDir, 'manifest.json'), 'utf8'));
const cli = resolve(root, 'node_modules/.bin/gltf-transform');
const stage = mkdtempSync(join(tmpdir(), 'block-party-glb-'));
const hasToktx = spawnSync('toktx', ['--version'], { stdio: 'ignore' }).status === 0;
const results = [];

try {
  for (const asset of manifest) {
    const input = join(assetDir, asset.file), output = join(stage, basename(asset.file));
    const before = statSync(input).size;
    const args = ['optimize', input, output,
      '--compress', 'meshopt', '--meshopt-level', 'high',
      '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false',
      '--simplify', 'false', '--texture-compress', hasToktx ? 'ktx2' : 'auto', '--texture-size', '2048'];
    const run = spawnSync(cli, args, { cwd: root, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`${asset.file}: ${run.stderr || run.stdout}`);
    const after = statSync(output).size; results.push({ file: asset.file, before, after });
  }
  for (const asset of manifest) renameSync(join(stage, basename(asset.file)), join(assetDir, asset.file));
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const before = results.reduce((sum, item) => sum + item.before, 0);
const after = results.reduce((sum, item) => sum + item.after, 0);
const saved = before ? Math.round((1 - after / before) * 100) : 0;
console.log(`Optimized ${results.length} GLB files with Meshopt: ${(before / 1024).toFixed(1)} KB -> ${(after / 1024).toFixed(1)} KB (${saved}% smaller).`);
console.log(hasToktx ? 'KTX2 texture compression enabled.' : 'KTX2 runtime ready; install toktx to compress future textures.');
