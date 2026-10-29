/**
 * Northflank provisioning script for the VibeSocial API.
 *
 * Creates, in order:
 *   1. a managed MySQL 8.4 addon
 *   2. the API service, built from the GitHub repo Dockerfile
 *   3. a secret group holding the runtime env vars, with the database
 *      credentials linked from the addon
 *   4. a public subdomain for the service
 *
 * Usage:  node deploy/northflank/setup.mjs <step>
 *   steps: repo-access | addon | service | secrets | domain | status | all
 *
 * The Northflank API token is read from the local CLI config and never
 * printed. Created resource ids are cached in .state.json so re-running a
 * step is safe and idempotent.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(HERE, '.state.json');
const CONFIG_PATH = join(homedir(), '.northflank', 'config.json');
const API = 'https://api.northflank.com/v1';

const PROJECT_ID = 'default';
const REPO = 'https://github.com/iamgokul01/vibe-social-service';
const BRANCH = 'main';
const SERVICE_NAME = 'vibe-social-api';
const ADDON_NAME = 'vibe-social-mysql';
const DB_NAME = 'vibesocial';
const CONTAINER_PORT = 4000;

// Compute plans are tried from smallest to largest so the free sandbox
// allowance is respected. Free projects reject plans that are too large.
const SERVICE_PLANS = [
  process.env.NF_SERVICE_PLAN,
  'nf-compute-50',
  'nf-compute-20',
  'nf-compute-10',
].filter(Boolean);
const ADDON_PLANS = [
  process.env.NF_DB_PLAN,
  'nf-compute-20',
  'nf-compute-10',
].filter(Boolean);
const DB_STORAGE = Number(process.env.NF_DB_STORAGE ?? 4096);

const cliConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const context = cliConfig.contexts.find((c) => c.name === cliConfig.current);
if (!context) throw new Error('No active Northflank CLI context found');
const token = context.token;

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
    const message =
      parsed?.message ??
      parsed?.error?.message ??
      JSON.stringify(parsed?.error ?? parsed);
    const error = new Error(`${method} ${path} -> ${response.status} :: ${message}`);
    error.status = response.status;
    error.body = parsed;
    throw error;
  }
  return parsed?.data ?? parsed;
}

const state = existsSync(STATE_PATH)
  ? JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  : {};
const saveState = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

/* ------------------------------------------------------------------ */
/* 1. MySQL addon                                                      */
/* ------------------------------------------------------------------ */
async function createAddon() {
  if (state.addonId) {
    console.log(`addon already exists: ${state.addonId}`);
    return state.addonId;
  }

  let lastError;
  for (const plan of ADDON_PLANS) {
    try {
      const addon = await api(`/projects/${PROJECT_ID}/addons`, {
        method: 'POST',
        body: {
          name: ADDON_NAME,
          type: 'mysql',
          version: '8.4.11',
          dbName: DB_NAME,
          billing: {
            deploymentPlan: plan,
            storage: DB_STORAGE,
            replicas: 1,
          },
          tlsEnabled: true,
        },
      });

      state.addonId = addon.id;
      state.addonPlan = plan;
      saveState();
      console.log(`created MySQL addon ${addon.id} on ${plan}`);

      const creds = await api(
        `/projects/${PROJECT_ID}/addons/${addon.id}/credentials`,
      ).catch((error) => {
        console.log(`credentials not ready yet: ${error.message}`);
        return null;
      });
      if (creds) {
        console.log('credential keys:', Object.keys(creds).join(', '));
        console.log(
          'credential shape:',
          JSON.stringify(
            Object.fromEntries(
              Object.entries(creds).map(([k, v]) => [
                k,
                typeof v === 'string' && v.length > 10
                  ? `${v.slice(0, 4)}...${v.slice(-3)}`
                  : v,
              ]),
            ),
            null,
            2,
          ),
        );
      }
      return addon.id;
    } catch (error) {
      lastError = error;
      console.log(`plan ${plan} rejected: ${error.message}`);
      if (error.status === 409 && /payment method/i.test(error.message)) throw error;
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ */
/* 2. API service (build from GitHub Dockerfile)                       */
/* ------------------------------------------------------------------ */
async function checkRepoAccess() {
  const result = await api(`/projects/${PROJECT_ID}/services/repo-access`, {
    method: 'POST',
    body: { projectUrl: REPO, projectType: 'github' },
  });
  console.log('repo access:', JSON.stringify(result, null, 2).slice(0, 1200));
  return result;
}

async function createService() {
  if (state.serviceId) {
    console.log(`service already exists: ${state.serviceId}`);
    return state.serviceId;
  }

  let lastError;
  for (const plan of SERVICE_PLANS) {
    try {
      const service = await api(`/projects/${PROJECT_ID}/services/combined`, {
        method: 'POST',
        body: {
          name: SERVICE_NAME,
          description: 'VibeSocial NestJS API',
          billing: { deploymentPlan: plan },
          vcsData: {
            projectUrl: REPO,
            projectType: 'github',
            projectBranch: BRANCH,
          },
          buildSettings: {
            dockerfile: {
              buildEngine: 'buildkit',
              dockerFilePath: '/Dockerfile',
              dockerWorkDir: '/',
            },
          },
          deployment: { instances: 1 },
          ports: [
            {
              name: 'http',
              internalPort: CONTAINER_PORT,
              public: true,
              protocol: 'HTTP',
            },
          ],
        },
      });

      state.serviceId = service.id;
      state.servicePlan = plan;
      saveState();
      console.log(`created API service ${service.id} on ${plan}`);
      return service.id;
    } catch (error) {
      lastError = error;
      console.log(`plan ${plan} rejected: ${error.message}`);
      if (error.status === 409 && /payment method/i.test(error.message)) throw error;
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------ */
/* 3. Secret group                                                     */
/* ------------------------------------------------------------------ */
async function createSecrets() {
  const addonId = state.addonId;
  const serviceId = state.serviceId;
  if (!addonId || !serviceId) {
    throw new Error('addon and service must exist before creating secrets');
  }

  const creds = await api(
    `/projects/${PROJECT_ID}/addons/${addonId}/credentials`,
  );
  console.log('raw credential keys:', Object.keys(creds ?? {}).join(', '));

  const jwtSecret = state.jwtSecret ?? randomBytes(32).toString('hex');
  state.jwtSecret = jwtSecret;
  const adminPassword =
    state.adminPassword ?? `Vs-${randomBytes(9).toString('base64url')}!a9`;
  state.adminPassword = adminPassword;
  saveState();

  const variables = {
    NODE_ENV: 'production',
    PORT: String(CONTAINER_PORT),
    DB_SYNCHRONIZE: 'false',
    DB_LOGGING: 'false',
    DB_FOREIGN_KEYS: 'true',
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_TTL_DAYS: '7',
    CORS_ORIGINS: 'http://localhost:5173,http://localhost:3000',
    TRUST_PROXY: 'true',
    SECURE_COOKIES: 'true',
    COOKIE_SAME_SITE: 'none',
    THROTTLE_TTL: '60',
    THROTTLE_LIMIT: '10',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@vibesocial.com',
    BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
    BOOTSTRAP_ADMIN_NAME: 'Platform Administrator',
  };

  // Prefer linking the addon credentials so they rotate automatically.
  const findKey = (...wanted) =>
    Object.keys(creds ?? {}).find((k) =>
      wanted.includes(k.toLowerCase()),
    );

  const links = [];
  const link = (keyName, alias) => {
    if (keyName) links.push({ keyName, aliases: [alias] });
  };
  link(findKey('host'), 'DB_HOST');
  link(findKey('port'), 'DB_PORT');
  link(findKey('username', 'user'), 'DB_USER');
  link(findKey('password'), 'DB_PASSWORD');
  link(findKey('database', 'dbname', 'db'), 'DB_NAME');

  console.log('addon links:', JSON.stringify(links));

  const body = {
    name: 'vibe-social-api-env',
    type: 'secret',
    secretType: 'environment',
    priority: 10,
    description: 'VibeSocial API runtime environment',
    secrets: { variables },
    restrictions: {
      restricted: true,
      nfObjects: [{ id: serviceId, type: 'service' }],
    },
  };
  if (links.length) body.addonDependencies = [{ addonId, keys: links }];

  const secret = await api(`/projects/${PROJECT_ID}/secrets`, {
    method: 'POST',
    body,
  });

  state.secretId = secret.id;
  saveState();
  console.log(`created secret group ${secret.id}`);
  return secret.id;
}

/* ------------------------------------------------------------------ */
/* 4. Public domain                                                    */
/* ------------------------------------------------------------------ */
async function createDomain() {
  const serviceId = state.serviceId;
  if (!serviceId) throw new Error('service must exist first');

  const service = await api(`/projects/${PROJECT_ID}/services/${serviceId}`);
  console.log('service domain:', JSON.stringify(service?.domain ?? null));
  console.log('service subdomain:', JSON.stringify(service?.subdomain ?? null));

  const existing = await api(
    `/projects/${PROJECT_ID}/services/${serviceId}/subdomains`,
  ).catch(() => null);
  console.log('existing subdomains:', JSON.stringify(existing));

  try {
    const created = await api(
      `/projects/${PROJECT_ID}/services/${serviceId}/subdomains`,
      { method: 'POST', body: { name: 'api' } },
    );
    console.log('created subdomain:', JSON.stringify(created, null, 2));
    state.domain = created?.domain ?? created?.name;
    saveState();
  } catch (error) {
    console.log(`subdomain creation note: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. Status                                                           */
/* ------------------------------------------------------------------ */
async function status() {
  const serviceId = state.serviceId;
  if (!serviceId) {
    console.log('no service yet');
    return;
  }
  const service = await api(`/projects/${PROJECT_ID}/services/${serviceId}`);
  console.log('=== SERVICE ===');
  console.log(JSON.stringify(service, null, 2).slice(0, 3000));

  const builds = await api(
    `/projects/${PROJECT_ID}/services/${serviceId}/build`,
  ).catch(() => null);
  console.log('=== BUILDS ===');
  console.log(JSON.stringify(builds, null, 2).slice(0, 1500));
}

const step = process.argv[2] ?? 'all';
const steps = {
  'repo-access': checkRepoAccess,
  addon: createAddon,
  service: createService,
  secrets: createSecrets,
  domain: createDomain,
  status,
};

if (step === 'all') {
  await createAddon();
  await createService();
  await createSecrets();
  await createDomain();
  await status();
} else if (steps[step]) {
  await steps[step]();
} else {
  console.error(`unknown step: ${step}. use one of ${Object.keys(steps).join(', ')}`);
  process.exit(1);
}

process.exit(0);
