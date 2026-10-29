/**
 * Verifies a deployed VibeSocial API instance.
 *
 * Usage: node deploy/northflank/verify.mjs <baseUrl> [email] [password]
 *
 * Checks the health probe, the Swagger page, and the full auth round trip
 * (login -> /auth/me -> cookie-only refresh) exactly as the frontend uses it.
 */

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
const email = process.argv[3] ?? 'admin@vibesocial.com';
const password = process.argv[4] ?? '';

if (!base) {
  console.error('usage: node verify.mjs <baseUrl> [email] [password]');
  process.exit(1);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/* Health ---------------------------------------------------------------- */
const health = await fetch(`${base}/api/health`).catch((e) => {
  console.log(`FAIL  health request threw: ${e.message}`);
  return null;
});
if (health) {
  const body = await health.json().catch(() => null);
  const data = body?.data ?? body;
  check(
    'health endpoint responds 200',
    health.status === 200,
    `status=${health.status}`,
  );
  check(
    'database reports up',
    data?.db === 'up',
    `db=${data?.db}`,
  );
  check('health status is ok', data?.status === 'ok', `status=${data?.status}`);
}

/* Swagger ---------------------------------------------------------------- */
const docs = await fetch(`${base}/api/docs`).catch(() => null);
if (docs) {
  const html = await docs.text();
  check('swagger docs respond 200', docs.status === 200, `status=${docs.status}`);
  check(
    'swagger page serves the UI bundle',
    html.includes('swagger-ui-bundle.js'),
  );
}

/* CORS preflight --------------------------------------------------------- */
const preflight = await fetch(`${base}/api/auth/login`, {
  method: 'OPTIONS',
  headers: {
    Origin: 'http://localhost:5173',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
}).catch(() => null);
if (preflight) {
  const allowOrigin = preflight.headers.get('access-control-allow-origin');
  check(
    'CORS allows the frontend origin',
    allowOrigin === 'http://localhost:5173',
    `allow-origin=${allowOrigin}`,
  );
  check(
    'CORS allows credentials',
    preflight.headers.get('access-control-allow-credentials') === 'true',
  );
}

/* Auth round trip -------------------------------------------------------- */
if (!password) {
  console.log('SKIP  auth round trip (no password supplied)');
} else {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);

  if (login) {
    const body = await login.json().catch(() => null);
    const token = body?.data?.accessToken;
    check('login responds 201', login.status === 201, `status=${login.status}`);
    check('login returns an access token', Boolean(token));

    const setCookie = login.headers.get('set-cookie') ?? '';
    check(
      'refresh cookie is SameSite=None (cross-site safe)',
      /SameSite=None/i.test(setCookie),
    );
    check('refresh cookie is HttpOnly', /HttpOnly/i.test(setCookie));
    check('refresh cookie is Secure', /Secure/i.test(setCookie));

    if (token) {
      const me = await fetch(`${base}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (me) {
        const meBody = await me.json().catch(() => null);
        check(
          'authenticated /auth/me responds 200',
          me.status === 200,
          `status=${me.status}`,
        );
        check(
          'returns the admin user',
          meBody?.data?.email === email,
          `email=${meBody?.data?.email}`,
        );
      }

      const cookie = setCookie.split(';')[0];
      const refresh = await fetch(`${base}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: cookie },
      }).catch(() => null);
      if (refresh) {
        const refreshBody = await refresh.json().catch(() => null);
        check(
          'cookie-only refresh responds 201',
          refresh.status === 201,
          `status=${refresh.status}`,
        );
        check(
          'refresh returns a new access token',
          Boolean(refreshBody?.data?.accessToken),
        );
      }
    }
  }
}

console.log(
  failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
