import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(
  readFileSync(join(homedir(), '.northflank', 'config.json'), 'utf8'),
);
const token = cfg.contexts.find((c) => c.name === cfg.current).token;
const API = 'https://api.northflank.com/v1';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} -> ${res.status} :: ${(parsed?.message ?? JSON.stringify(parsed?.error ?? parsed)).slice(0, 300)}`,
    );
  }
  return parsed?.data ?? parsed;
}

// The account already holds its single free project ("default"). Free
// projects only run in europe-west / us-central, so initialise it there.
for (const region of ['europe-west', 'us-central']) {
  try {
    const result = await api('/projects/default/initialize', {
      method: 'POST',
      body: { region },
    });
    console.log(`initialized default project in ${region}:`, JSON.stringify(result));
    break;
  } catch (error) {
    console.log(`${region}: ${error.message}`);
  }
}

const project = await api('/projects/default');
console.log('project state:', JSON.stringify(project, null, 2).slice(0, 1200));

const statePath = join(HERE, '.state.json');
let state = {};
try {
  state = JSON.parse(readFileSync(statePath, 'utf8'));
} catch {}
state.projectId = 'default';
writeFileSync(statePath, JSON.stringify(state, null, 2));

process.exit(0);
