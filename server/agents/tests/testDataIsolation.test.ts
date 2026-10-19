import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR } from '../../dataDirectory';

async function main(): Promise<void> {
  const configured = process.env.SENTINEL_NOVA_DATA_DIR;
  assert.ok(configured, 'isolated test runner must set SENTINEL_NOVA_DATA_DIR');
  assert.equal(DATA_DIR, path.resolve(configured));
  assert.notEqual(DATA_DIR, path.resolve(process.cwd(), 'data'));
  assert.ok(DATA_DIR.startsWith(path.resolve(os.tmpdir()) + path.sep));

  const markerPath = path.join(DATA_DIR, 'runner-isolation.marker');
  await fs.writeFile(markerPath, 'isolated');
  assert.equal(await fs.readFile(markerPath, 'utf8'), 'isolated');
  console.log('Test data isolation passed: runtime store is a fresh temporary directory, not repository data/.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'test_data_isolation_failed');
  process.exitCode = 1;
});
