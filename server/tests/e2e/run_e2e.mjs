// server/tests/e2e/run_e2e.mjs
// Isolated E2E runner using separate test database (titik_temu_pos_test) so dev DB is untouched.
// Usage: node tests/e2e/run_e2e.mjs tests/e2e/verify_fase1.mjs tests/e2e/verify_fase2.mjs ...

import dotenv from 'dotenv';
dotenv.config();

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = join(__dirname, '..', '..');
const clientDir = join(serverDir, '..', 'client');

const TEST_DB = process.env.TEST_DB_NAME || 'titik_temu_pos_test';
const TEST_API_PORT = '3005';
const TEST_CLIENT_PORT = '5175';

const basePgConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
};

async function createAndSeedTestDb() {
  const adminPool = new pg.Pool({ ...basePgConfig, database: 'postgres' });
  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await adminPool.query(`CREATE DATABASE "${TEST_DB}" ENCODING 'UTF8'`);
  } finally {
    await adminPool.end();
  }

  const testPool = new pg.Pool({ ...basePgConfig, database: TEST_DB });
  try {
    const migSql = readFileSync(join(serverDir, 'src', 'db', 'migrations', '001_create_tables.sql'), 'utf8');
    const seedSql = readFileSync(join(serverDir, 'src', 'db', 'seed.sql'), 'utf8');
    await testPool.query(migSql);
    await testPool.query(seedSql);
  } finally {
    await testPool.end();
  }
}

async function dropTestDb() {
  const adminPool = new pg.Pool({ ...basePgConfig, database: 'postgres' });
  try {
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
  } finally {
    await adminPool.end();
  }
}

async function waitForUrl(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

function runChild(cmd, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const scripts = process.argv.slice(2);
  if (scripts.length === 0) {
    process.stderr.write('Usage: node tests/e2e/run_e2e.mjs <script1.mjs> [script2.mjs ...]\n');
    process.exit(1);
  }

  let viteProc = null;

  try {
    process.stdout.write(`Setting up isolated test database: ${TEST_DB}...\n`);
    await createAndSeedTestDb();

    viteProc = spawn(
      'node',
      ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', TEST_CLIENT_PORT],
      {
        cwd: clientDir,
        env: {
          ...process.env,
          VITE_API_TARGET: `http://localhost:${TEST_API_PORT}`,
        },
        stdio: 'pipe',
      }
    );
    await waitForUrl(`http://localhost:${TEST_CLIENT_PORT}/`);

    for (const script of scripts) {
      await createAndSeedTestDb();
      const apiProc = spawn('node', ['src/server.js'], {
        cwd: serverDir,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          TEST_DB_NAME: TEST_DB,
          PORT: TEST_API_PORT,
          CLIENT_ORIGIN: `http://localhost:${TEST_CLIENT_PORT}`,
        },
        stdio: 'pipe',
      });

      try {
        await waitForUrl(`http://localhost:${TEST_API_PORT}/api/health`);
        process.stdout.write(`\n--- Running ${script} on ${TEST_DB} ---\n`);
        await runChild('node', [script], serverDir, {
          E2E_CLIENT_URL: `http://localhost:${TEST_CLIENT_PORT}`,
        });
      } finally {
        apiProc.kill();
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } finally {
    if (viteProc) viteProc.kill();
    await new Promise((r) => setTimeout(r, 400));
    process.stdout.write(`Cleaning up ${TEST_DB}...\n`);
    await dropTestDb();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
