'use strict';

/**
 * Blocks container startup until MySQL is reachable.
 * Cloud databases and docker-compose services both start asynchronously, so the
 * migration step needs the connection to be live before it runs.
 */

const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || 'localhost';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

const maxAttempts = Number(process.env.DB_WAIT_ATTEMPTS || 60);
const retryDelayMs = Number(process.env.DB_WAIT_DELAY_MS || 3000);
const useSsl = /^(1|true|yes|on)$/i.test(process.env.DB_SSL ?? '');

async function waitForDatabase() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 5000,
        ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      });
      await connection.end();
      console.log(`[entrypoint] database reachable at ${host}:${port}`);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (attempt >= maxAttempts) {
        console.error(`[entrypoint] database unreachable after ${attempt} attempts: ${reason}`);
        process.exit(1);
      }

      console.log(
        `[entrypoint] database not ready (${attempt}/${maxAttempts}): ${reason} - retrying in ${retryDelayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

waitForDatabase().catch((error) => {
  console.error('[entrypoint] database wait failed:', error);
  process.exit(1);
});
