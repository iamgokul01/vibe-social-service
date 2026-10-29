/**
 * Links the MySQL addon credentials into the API service's secret group and
 * restarts the service so it picks up the database environment variables.
 *
 * Northflank exposes addon credentials as flat keys inside `secrets`
 * (USERNAME, PASSWORD, DATABASE) and `envs` (HOST, PORT). Link keys must be
 * letters only, so they are linked as HOST / PORT / USERNAME / PASSWORD /
 * DATABASE and aliased to the DB_* names the app expects.
 *
 * Usage: node deploy/northflank/link-db.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(HERE, '.state.json');
const CONFIG_PATH = join(homedir(), '.northflank', 'config.json');
const API = 'https://api.northflank.com/v1';
const PROJECT_ID = 'default';

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

const addonId = state.addonId;
const secretId = state.secretId;
const serviceId = state.serviceId;
console.log(`addon=${addonId} secret=${secretId} service=${serviceId}`);

const LINK_KEYS = [
  { keyName: 'HOST', aliases: ['DB_HOST'] },
  { keyName: 'PORT', aliases: ['DB_PORT'] },
  { keyName: 'USERNAME', aliases: ['DB_USER'] },
  { keyName: 'PASSWORD', aliases: ['DB_PASSWORD'] },
  { keyName: 'DATABASE', aliases: ['DB_NAME'] },
];

const link = await api(
  `/projects/${PROJECT_ID}/secrets/${secretId}/addons/${addonId}`,
  { method: 'POST', body: { keys: LINK_KEYS } },
);
console.log('=== LINK RESULT ===');
console.log(JSON.stringify(link, null, 2));

// Read the secret back and list the variable names now present.
const details = await api(
  `/projects/${PROJECT_ID}/secrets/${secretId}/details`,
).catch(() => null);
const names = Object.keys(details?.variables ?? details?.secrets?.variables ?? {});
console.log('=== SECRET VARIABLE NAMES ===');
console.log(names.join(', '));
for (const expected of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
  console.log(`${names.includes(expected) ? 'OK  ' : 'MISS'} ${expected}`);
}

// Restart the service so the new environment takes effect.
console.log('=== RESTARTING SERVICE ===');
await api(`/projects/${PROJECT_ID}/services/${serviceId}/restart`, {
  method: 'POST',
});

state.dbLinked = true;
writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
console.log('done');
process.exit(0);
