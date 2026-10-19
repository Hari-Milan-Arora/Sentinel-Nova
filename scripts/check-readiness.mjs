import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const failures = [];
const warnings = [];
const checks = [];
const add = (label, ok, detail = '') => {
  checks.push({ label, ok, detail });
  if (!ok) failures.push(label);
};
const isUsable = (value) => Boolean(value?.trim()) && !/^(your[-_ ]|replace[-_ ]|placeholder|example)/i.test(value.trim());

const nodeMajor = Number(process.versions.node.split('.')[0]);
add('Node.js 20 or newer', nodeMajor >= 20, `found ${process.versions.node}`);
add('Node dependencies installed', fs.existsSync(path.join(process.cwd(), 'node_modules', 'tsx', 'package.json')) && fs.existsSync(path.join(process.cwd(), 'node_modules', 'vite', 'package.json')));

const backendClientId = process.env.GOOGLE_CLIENT_ID;
const frontendClientId = process.env.VITE_GOOGLE_CLIENT_ID || backendClientId;
add('Google OAuth client ID configured for server', isUsable(backendClientId));
add('Google OAuth client ID configured for frontend', isUsable(frontendClientId));
add(
  'Frontend and server OAuth client IDs match',
  isUsable(frontendClientId) && frontendClientId === backendClientId,
  'set VITE_GOOGLE_CLIENT_ID to the same Web client ID as GOOGLE_CLIENT_ID in .env'
);
add('AUTH_SECRET is non-placeholder and at least 32 characters', isUsable(process.env.AUTH_SECRET) && process.env.AUTH_SECRET.trim().length >= 32);
warnings.push('Google Cloud OAuth settings cannot be verified locally; the configured Web client must authorize http://localhost:3000 as a JavaScript origin.');

const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
add('Gemini model ID has valid syntax', /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(model));
if (isUsable(process.env.GEMINI_API_KEY)) {
  checks.push({ label: 'Gemini API key configured', ok: true, detail: 'value is hidden; live connectivity is not tested by startup checks' });
  warnings.push('Run npm run smoke:gemini to verify live Gemini connectivity before relying on LLM features.');
} else {
  warnings.push('Gemini API key missing or placeholder; app can run in deterministic fallback mode, but live LLM features will be unavailable.');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

const apiPortFree = await isPortFree(3001);
const frontendPortFree = await isPortFree(3000);
add('API port 3001 is available', apiPortFree);
add('Frontend port 3000 is available', frontendPortFree);

const python = process.env.SENTINEL_NOVA_PYTHON || process.env.PYTHON || 'python';
const pythonCheck = spawnSync(python, ['-c', 'import numpy, pandas, sklearn, openpyxl, joblib'], { stdio: 'ignore' });
if (pythonCheck.error || pythonCheck.status !== 0) {
  warnings.push('Python ML dependencies are unavailable; Python model diagnostics/tests require Python plus ml/requirements.txt. The experimental lead-time model is disabled, so this does not block app startup.');
} else {
  checks.push({ label: 'Python ML dependencies available', ok: true, detail: '' });
}

checks.push({ label: 'Experimental Jira lead-time model remains disabled', ok: process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL !== 'true', detail: '' });
if (process.env.SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL === 'true') failures.push('Experimental Jira lead-time model must remain disabled');

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}${check.detail ? ` (${check.detail})` : ''}`);
for (const warning of warnings) console.log(`WARN ${warning}`);
if (failures.length) {
  console.error('\nNot ready to launch. Fix the failed checks above; do not share the .env values when requesting help.');
  process.exitCode = 1;
} else {
  console.log('\nReady to start the API on http://localhost:3001 and the Vite frontend on http://localhost:3000.');
  if (warnings.length) console.log('The application will start with the degraded capabilities listed above.');
}
