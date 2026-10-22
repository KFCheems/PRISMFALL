// Runs the balance diagnostic with the tools directory included.
import { spawnSync } from 'node:child_process'

const r = spawnSync('npx', ['playwright', 'test', 'tests/tools/balance.spec.ts', '--reporter=line'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PF_TOOLS: '1' },
})
process.exit(r.status ?? 1)
