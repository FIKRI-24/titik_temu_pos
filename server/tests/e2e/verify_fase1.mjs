// server/tests/e2e/verify_fase1.mjs
// End-to-End verification for Fase 1 (Auth, Role Guard, Rate Limit, User Management)
// Usage: node tests/e2e/verify_fase1.mjs (run from server/ while server & client are running)

import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.E2E_CLIENT_URL || 'http://localhost:5173';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pageErrors = [];

  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Unauthenticated access redirects to /login
    for (const route of ['/transaksi', '/laporan', '/pengguna', '/dashboard']) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle0' });
      assert.ok(page.url().endsWith('/login'), `Expected ${route} to redirect to /login, got ${page.url()}`);
    }
    process.stdout.write('PASS 1: Unauthenticated access to /dashboard, /transaksi, /laporan, /pengguna redirects to /login\n');

    // 2. Empty login submission
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.click('button[type="submit"]');
    await page.waitForSelector('.login-alert-error');
    const emptyErr = await page.$eval('.login-alert-error', (el) => el.textContent.trim());
    assert.equal(emptyErr, 'Username dan password harus diisi.');
    process.stdout.write(`PASS 2: Empty login shows validation message: ${emptyErr}\n`);

    // 3. Uniform error message for wrong username vs wrong password (2 failed login attempts)
    await page.type('#username', 'tidak_ada_user');
    await page.type('#password', 'Salah123');
    const [respWrongUser] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.click('button[type="submit"]'),
    ]);
    assert.equal(respWrongUser.status(), 401);
    const errMsgWrongUser = await page.$eval('.login-alert-error', (el) => el.textContent.trim());

    await page.click('#username', { clickCount: 3 });
    await page.type('#username', 'admin');
    await page.click('#password', { clickCount: 3 });
    await page.type('#password', 'PasswordSalah');
    const [respWrongPass] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.click('button[type="submit"]'),
    ]);
    assert.equal(respWrongPass.status(), 401);
    const errMsgWrongPass = await page.$eval('.login-alert-error', (el) => el.textContent.trim());

    assert.equal(errMsgWrongUser, 'Username atau password tidak sesuai.');
    assert.equal(errMsgWrongPass, errMsgWrongUser);
    process.stdout.write(`PASS 3: Uniform login error message verified: ${errMsgWrongUser}\n`);

    // 4. Login as kasir1
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#username', 'kasir1');
    await page.type('#password', 'Kasir#2026');
    const [kasirLoginResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.click('button[type="submit"]'),
    ]);
    assert.equal(kasirLoginResp.status(), 200);
    await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 5000 });
    await page.waitForSelector('.app-sidebar', { timeout: 5000 });

    const docCookie = await page.evaluate(() => document.cookie);
    assert.ok(!docCookie.includes('token='), 'JWT cookie must be httpOnly and invisible to document.cookie');

    const sidebarText = await page.$eval('.app-sidebar', (el) => el.textContent);
    assert.ok(!sidebarText.includes('Kelola pengguna'), 'Kasir sidebar should not show Kelola pengguna');

    const usersApiStatus = await page.evaluate(async () => {
      const res = await fetch('/api/users', { credentials: 'include' });
      return res.status;
    });
    assert.equal(usersApiStatus, 403);

    for (const adminRoute of ['/laporan', '/pengguna']) {
      await page.goto(`${BASE_URL}${adminRoute}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.forbidden-screen');
      const forbiddenText = await page.$eval('.forbidden-screen', (el) => el.textContent);
      assert.ok(forbiddenText.includes('403') && forbiddenText.includes('Tidak punya akses'));
    }
    process.stdout.write('PASS 4: Kasir role restrictions verified (httpOnly cookie, hidden sidebar, 403 API & UI on /laporan and /pengguna)\n');

    // 5. Logout and Browser Back button check
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle0' });
    const [logoutResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/logout')),
      page.click('.btn-logout'),
    ]);
    assert.equal(logoutResp.status(), 200);
    await page.waitForFunction(() => window.location.pathname === '/login');

    await page.goBack({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.location.pathname === '/login');
    assert.ok(page.url().endsWith('/login'));
    process.stdout.write('PASS 5: Logout clears cookie and Browser Back does NOT open protected route\n');

    // 6. Login as admin and test User Management UI (8-char password minimum)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#username');
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard' || window.location.pathname === '/pengguna'),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForSelector('.app-sidebar');

    const adminSidebar = await page.$eval('.app-sidebar', (el) => el.textContent);
    assert.ok(adminSidebar.includes('Kelola pengguna'));

    await page.click('a[href="/pengguna"]');
    await page.waitForSelector('.users-table');

    // Verify API rejects 7-char password with 422
    const shortPwStatus = await page.evaluate(async () => {
      const res = await fetch('/api/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'short_pw_user',
          nama_lengkap: 'Short PW',
          role: 'kasir',
          password: '1234567',
        }),
      });
      return res.status;
    });
    assert.equal(shortPwStatus, 422, 'Expected 7-char password to be rejected with 422');

    // Create user kasir_uji with 8+ char password
    await page.click('.users-page .btn-primary');
    await page.waitForSelector('#create-username');
    await page.type('#create-username', 'kasir_uji');
    await page.type('#create-nama', 'Kasir Uji');
    await page.type('#create-password', 'KasirUji#2026');
    const [createResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/users') && r.request().method() === 'POST'),
      page.click('.modal-panel button[type="submit"]'),
    ]);
    assert.equal(createResp.status(), 201);
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.users-table tbody tr')).some((r) => r.innerText.includes('kasir_uji'))
    );

    // Edit role of kasir_uji to admin
    const editBtn = await page.evaluateHandle(() => {
      const rows = Array.from(document.querySelectorAll('.users-table tbody tr'));
      const row = rows.find((r) => r.innerText.includes('kasir_uji'));
      return row.querySelector('button');
    });
    await editBtn.click();
    await page.waitForSelector('#edit-role');
    await page.select('#edit-role', 'admin');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/users/') && r.request().method() === 'PATCH'),
      page.click('.modal-panel button[type="submit"]'),
    ]);

    // Reset password of kasir_uji
    const resetBtn = await page.evaluateHandle(() => {
      const rows = Array.from(document.querySelectorAll('.users-table tbody tr'));
      const row = rows.find((r) => r.innerText.includes('kasir_uji'));
      return row.querySelectorAll('button')[1];
    });
    await resetBtn.click();
    await page.waitForSelector('#reset-password-input');
    await page.type('#reset-password-input', 'BaruPass#2026');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/reset-password') && r.request().method() === 'PATCH'),
      page.click('.modal-panel button[type="submit"]'),
    ]);

    // Deactivate kasir_uji
    const deactBtn = await page.evaluateHandle(() => {
      const rows = Array.from(document.querySelectorAll('.users-table tbody tr'));
      const row = rows.find((r) => r.innerText.includes('kasir_uji'));
      return row.querySelectorAll('button')[2];
    });
    await deactBtn.click();
    await page.waitForSelector('.modal-panel .btn-danger');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/users/') && r.request().method() === 'PATCH'),
      page.click('.modal-panel .btn-danger'),
    ]);
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('.users-table tbody tr'));
      const row = rows.find((r) => r.innerText.includes('kasir_uji'));
      return row && row.innerText.includes('Nonaktif');
    });
    process.stdout.write('PASS 6: Admin User Management CRUD & 8-char password minimum verified\n');

    // Logout admin & verify deactivated user kasir_uji cannot login (403 - does count as failed attempt)
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/logout')),
      page.click('.btn-logout'),
    ]);
    await page.waitForFunction(() => window.location.pathname === '/login');

    await page.type('#username', 'kasir_uji');
    await page.type('#password', 'BaruPass#2026');
    const [deactLoginResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.click('button[type="submit"]'),
    ]);
    assert.equal(deactLoginResp.status(), 403);
    process.stdout.write('PASS 7: Deactivated user blocked at login (403)\n');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(', ')}`);
    process.stdout.write('PASS 8: Zero uncaught page errors in Chrome\n');

    // 9. Rate limit test: 2 failed attempts in Step 3 + 1 in Step 7 = 3 failed so far.
    // Successful logins (kasir1, admin) did NOT count (skipSuccessfulRequests: true).
    // Sending more failed attempts until 429: should allow up to 10 failed total, trigger 429 on #11 failed total (8th in loop).
    let failedBefore429 = 3; // already had 3 failed logins above
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'WrongPassword!' }),
      });
      if (res.status === 429) {
        const body = await res.json();
        got429 = true;
        assert.equal(failedBefore429, 10, `Expected 10 failed attempts before 429, got ${failedBefore429}`);
        process.stdout.write(
          `PASS 9: Rate limit triggered after ${failedBefore429} failed attempts (on #11 failed, successful logins skipped) with HTTP 429: ${body.error.message}\n`
        );
        break;
      }
      assert.equal(res.status, 401);
      failedBefore429++;
    }
    assert.ok(got429, 'Expected login rate limiter to return HTTP 429 after 10 failed attempts');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  process.stderr.write(`FAILED: ${err.stack || err}\n`);
  process.exit(1);
});
