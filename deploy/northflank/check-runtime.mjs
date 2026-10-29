import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cfg = JSON.parse(
  readFileSync(join(homedir(), '.northflank', 'config.json'), 'utf8'),
);
const token = cfg.contexts.find((c) => c.name === cfg.current).token;
const API = 'https://api.northflank.com/v1';
const PROJECT = 'default';
const SERVICE = 'vibe-social-api';

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  try {
    const p = JSON.parse(text);
    return p?.data ?? p;
  } catch {
    return text;
  }
}

// What environment does the service actually receive?
const env = await api(
  `/projects/${PROJECT}/services/${SERVICE}/runtime-environment`,
);
const variables = env?.variables ?? env ?? {};
console.log('=== RUNTIME ENV VARIABLE NAMES ===');
console.log(Object.keys(variables).join(', '));
for (const key of [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'NODE_ENV',
]) {
  const present = Object.prototype.hasOwnProperty.call(variables, key);
  const value = present ? String(variables[key]) : '';
  const redacted =
    value.length > 12 ? `${value.slice(0, 4)}...${value.slice(-3)}` : value;
  console.log(`${present ? 'OK  ' : 'MISS'} ${key} = ${redacted}`);
}

// Recent container logs.
console.log('\n=== SERVICE LOGS (tail) ===');
const logs = await api(`/projects/${PROJECT}/services/${SERVICE}/logs`);
const entries = logs?.logs ?? logs ?? [];
const tail = Array.isArray(entries) ? entries.slice(-45) : entries;
for (const entry of tail) {
  console.log(
    typeof entry === 'string'
      ? entry
      : `[${entry?.ts ?? entry?.timestamp ?? ''}] ${entry?.log ?? entry?.message ?? JSON.stringify(entry)}`,
  );
}

process.exit(0);
