/**
 * Northflank discovery helper.
 *
 * Reads the token from the Northflank CLI config on this machine and prints
 * the account facts needed to provision the VibeSocial API: available MySQL
 * addon versions, compute plans, credit balance and existing projects.
 *
 * The token is never printed.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_PATH = join(homedir(), '.northflank', 'config.json');
const API = 'https://api.northflank.com/v1';

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const context = config.contexts.find((c) => c.name === config.current);
if (!context) throw new Error('No active Northflank CLI context found');

const token = context.token;

async function api(path) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message =
      body?.error?.message ?? body?.message ?? JSON.stringify(body);
    throw new Error(`${response.status} ${response.statusText} :: ${message}`);
  }
  return body;
}

/** Pull the first array out of a Northflank envelope, whatever it is called. */
function findArray(body) {
  if (Array.isArray(body)) return body;
  const candidates = [
    body?.data,
    body?.data?.projects,
    body?.data?.plans,
    body?.data?.types,
    body?.data?.addonTypes,
    body?.data?.data,
    body?.projects,
    body?.plans,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

const my = process.argv[2] ?? 'all';

if (my === 'all' || my === 'projects') {
  const body = await api('/projects');
  console.log('=== PROJECTS ===');
  for (const p of findArray(body)) {
    console.log(
      `${p.id}\t${p.name}\t${p.lifecycleStatus ?? ''}\t${p.environmentId ?? ''}`,
    );
  }
  if (my === 'all') console.log('raw keys:', JSON.stringify(body).slice(0, 700));
}

if (my === 'all' || my === 'addon-types') {
  const body = await api('/addon-types');
  const all = findArray(body);
  const mysql = all.filter((t) =>
    JSON.stringify(t).toLowerCase().includes('mysql'),
  );
  console.log('=== MYSQL ADDON TYPES ===');
  console.log(JSON.stringify(mysql, null, 2).slice(0, 7000));
  if (my === 'all') console.log('raw keys:', JSON.stringify(body).slice(0, 500));
}

if (my === 'all' || my === 'plans') {
  const body = await api('/plans');
  console.log('=== COMPUTE PLANS ===');
  for (const p of findArray(body)) {
    const id = p.id ?? p.plan ?? '';
    if (!String(id).startsWith('nf-compute')) continue;
    console.log(
      `${id}\t${p.cpuResource ?? p.cpu ?? '?'} vCPU\t${p.ramResource ?? p.ramMB ?? '?'}MB\t$${p.amountPerHour ?? '?'}/hr`,
    );
  }
  if (my === 'all') console.log('raw keys:', JSON.stringify(body).slice(0, 500));
}

if (my === 'all' || my === 'team') {
  for (const path of ['/teams/95924562', '/subscription', '/auth']) {
    try {
      const body = await api(path);
      console.log(`=== ${path} ===`);
      console.log(JSON.stringify(body, null, 2).slice(0, 2000));
    } catch (error) {
      console.log(`=== ${path} ===\n${error.message}`);
    }
  }
}

if (my === 'all' || my === 'project') {
  for (const id of ['6ae37ca989387bfee79e6983', 'default']) {
    try {
      const body = await api(`/projects/${id}`);
      console.log(`=== PROJECT ${id} ===`);
      console.log(JSON.stringify(body, null, 2).slice(0, 2500));
    } catch (error) {
      console.log(`=== PROJECT ${id} ===\n${error.message}`);
    }
  }
}

if (my === 'all' || my === 'credit') {
  try {
    const body = await api('/credit-balance');
    console.log('=== CREDIT BALANCE ===');
    console.log(JSON.stringify(body, null, 2).slice(0, 1500));
  } catch (error) {
    console.log(`=== CREDIT BALANCE ===\n${error.message}`);
  }
}
