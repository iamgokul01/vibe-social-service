/**
 * Finishes the VibeSocial deployment on Northflank.
 *
 *   1. adds DB_SSL=true to the service secret group (full map is rewritten,
 *      because patch replaces the variables map wholesale)
 *   2. re-asserts the MySQL addon link
 *   3. triggers a rebuild so the service picks up the latest commit
 *   4. waits for build + deployment to complete
 *   5. resolves the public URL and runs the verification suite
 *
 * Usage: node deploy/northflank/finalize.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(HERE, '.state.json');
const CONFIG_PATH = join(homedir(), '.northflank', 'config.json');
const API = 'https://api.northflank.com/v1';
const PROJECT_ID = 'default';
const SERVICE_ID = 'vibe-social-api';
const ADDON_ID = 'vibe-social-mysql';
const SECRET_ID = 'vibe-social-api-env';

const cliConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const context = cliConfig.contexts.find((c) => c.name === cliConfig.current);
const token = context.token;

const state = existsSync(STATE_PATH)
  ? JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  : {};

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new Error(
      `${method} ${path} -> ${response.status} :: ${(parsed?.message ?? JSON.stringify(parsed?.error ?? parsed)).slice(0, 300)}`,
    );
  }
  return parsed?.data ?? parsed;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 1. Rewrite the secret group's variables with DB_SSL enabled ------------ */
const variables = {
  NODE_ENV: 'production',
  PORT: '4000',
  DB_SYNCHRONIZE: 'false',
  DB_LOGGING: 'false',
  DB_FOREIGN_KEYS: 'true',
  DB_SSL: 'true',
  JWT_SECRET: state.jwtSecret,
  JWT_EXPIRES_IN: '15m',
  JWT_REFRESH_TTL_DAYS: '7',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:3000',
  TRUST_PROXY: 'true',
  SECURE_COOKIES: 'true',
  COOKIE_SAME_SITE: 'none',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '10',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@vibesocial.com',
  BOOTSTRAP_ADMIN_PASSWORD: state.adminPassword,
  BOOTSTRAP_ADMIN_NAME: 'Platform Administrator',
};

if (!state.jwtSecret || !state.adminPassword) {
  throw new Error('missing jwtSecret/adminPassword in .state.json');
}

console.log('=== patching secret group ===');
await api(`/projects/${PROJECT_ID}/secrets/${SECRET_ID}`, {
  method: 'PATCH',
  body: { secrets: { variables } },
});
console.log('secret group updated with DB_SSL=true');

/* 2. Re-assert the addon link -------------------------------------------- */
console.log('=== re-asserting addon link ===');
await api(`/projects/${PROJECT_ID}/secrets/${SECRET_ID}/addons/${ADDON_ID}`, {
  method: 'POST',
  body: {
    keys: [
      { keyName: 'HOST', aliases: ['DB_HOST'] },
      { keyName: 'PORT', aliases: ['DB_PORT'] },
      { keyName: 'USERNAME', aliases: ['DB_USER'] },
      { keyName: 'PASSWORD', aliases: ['DB_PASSWORD'] },
      { keyName: 'DATABASE', aliases: ['DB_NAME'] },
    ],
  },
});
console.log('addon link OK');

/* 3. Trigger a rebuild from the latest commit ----------------------------- */
console.log('=== triggering rebuild ===');
await api(`/projects/${PROJECT_ID}/services/${SERVICE_ID}/build`, {
  method: 'POST',
  body: {},
}).catch(async (error) => {
  console.log(`build endpoint said: ${error.message}`);
  console.log('restarting the service instead');
  await api(`/projects/${PROJECT_ID}/services/${SERVICE_ID}/restart`, {
    method: 'POST',
  });
});

/* 4. Wait for build + deployment ------------------------------------------ */
console.log('=== waiting for build and deployment ===');
const deadline = Date.now() + 25 * 60 * 1000;
let last = '';
let service = null;
while (Date.now() < deadline) {
  service = await api(`/projects/${PROJECT_ID}/services/${SERVICE_ID}`);
  const build = service?.status?.build?.status ?? 'n/a';
  const deployment = service?.status?.deployment?.status ?? 'n/a';
  const line = `build=${build} deployment=${deployment}`;
  if (line !== last) {
    console.log(line);
    last = line;
  }
  if (build === 'SUCCESS' && deployment === 'COMPLETED') break;
  if (build === 'FAILURE') {
    const logs = await api(
      `/projects/${PROJECT_ID}/services/${SERVICE_ID}/build-logs`,
    ).catch(() => null);
    console.log('build logs:', JSON.stringify(logs).slice(0, 3000));
    throw new Error('build failed');
  }
  await sleep(10000);
}

/* 5. Resolve the public URL and verify ------------------------------------ */
const dns = service?.ports?.[0]?.dns;
const url = dns ? `https://${dns}` : null;
console.log('=== PUBLIC URL ===');
console.log(url ?? '(not found)');
if (url) {
  state.publicUrl = url;
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  console.log('=== waiting for the app to answer ===');
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await fetch(`${url}/api/health`).catch(() => null);
    if (response && response.status === 200) {
      console.log(`health OK after ${attempt} attempt(s)`);
      break;
    }
    console.log(`waiting for health (${attempt}/30)...`);
    await sleep(10000);
  }

  console.log('=== verification suite ===');
  const result = spawnSync(
    process.execPath,
    [
      join(HERE, 'verify.mjs'),
      url,
      'admin@vibesocial.com',
      state.adminPassword,
    ],
    { stdio: 'inherit' },
  );
  console.log(`verification exit code: ${result.status}`);
}

process.exit(0);
