// run-all.mjs — 依次运行全部验证脚本
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = ['verify-main-paths.mjs', 'verify-advanced.mjs'];
let code = 0;

for (const f of files) {
  console.log(`\n════════════════════ 运行 ${f} ════════════════════`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) code = 1;
}

console.log(code === 0 ? '\n全部测试通过 ✔' : '\n存在失败项 ✘');
process.exit(code);
