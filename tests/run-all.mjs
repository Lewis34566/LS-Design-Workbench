// run-all.mjs - Run all verification scripts in sequence
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = ['verify-main-paths.mjs', 'verify-advanced.mjs'];
let code = 0;

for (const f of files) {
  console.log(`\n==================== Running ${f} ====================`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) code = 1;
}

console.log(code === 0 ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(code);
