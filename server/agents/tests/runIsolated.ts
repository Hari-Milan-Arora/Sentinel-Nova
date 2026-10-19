import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const testsRoot = path.resolve(projectRoot, 'server', 'agents', 'tests');
  const testFile = path.resolve(projectRoot, process.argv[2] || '');
  if (!testFile.startsWith(`${testsRoot}${path.sep}`) || !testFile.endsWith('.test.ts')) {
    throw new Error('isolated_test_runner_requires_repository_test_file');
  }

  const tempDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-nova-test-data-'));
  const resolvedRepoData = path.resolve(projectRoot, 'data');
  assert.notEqual(tempDataDir, resolvedRepoData, 'tests must never use the repository runtime data directory');
  assert.ok(tempDataDir.startsWith(path.resolve(os.tmpdir()) + path.sep), 'temporary data path must remain under OS temp');
  const tsxCli = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [tsxCli, testFile], {
        cwd: projectRoot,
        env: { ...process.env, SENTINEL_NOVA_DATA_DIR: tempDataDir },
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    if (exitCode !== 0) process.exitCode = exitCode;
  } finally {
    // mkdtemp gave this invocation a fresh, uniquely named disposable directory.
    await fs.rm(tempDataDir, { recursive: true, force: true });
    await assert.rejects(fs.stat(tempDataDir), { code: 'ENOENT' }, 'isolated test directory must be removed after the child exits');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'isolated_test_runner_failed');
  process.exitCode = 1;
});
