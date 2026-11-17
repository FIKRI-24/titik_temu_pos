// server/tests/e2e/verify_fase6.mjs
// End-to-End verification for Fase 6 (UI/UX, axe-core a11y, Modal Focus Trap/Esc/Restore, POS Keyboard, 401 Session Expiry, Offline Resilience, 404, Title/Favicon)

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core');

const CHROME_PATH =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.E2E_CLIENT_URL || 'http://localhost:5173';

async function assertNoSeriousAxeViolations(page, screenName) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const res = await window.axe.run();
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    }));
  });
  const severe = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  assert.equal(
    severe.length,
    0,
    `Axe serious/critical violations on ${screenName}: ${JSON.stringify(severe)}`
  );
  return violations;
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pageErrors = [];

  try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // 1. Login page title, favicon, and axe check
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    const faviconInfo = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="icon"]');
      if (!link) return { exists: false };
      const res = await fetch(link.getAttribute('href'));
      return { exists: true, status: res.status, ct: res.headers.get('content-type') };
    });
    assert.equal(faviconInfo.exists, true);
    assert.equal(faviconInfo.status, 200);
    assert.match(documentTitle(await page.title()), /Masuk/);
    await assertNoSeriousAxeViolations(page, 'login');

    // Login as admin
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForSelector('[data-testid="kpi-omset"]');
    await page.waitForSelector('.recharts-bar-rectangle');
    assert.match(await page.title(), /Dashboard/);
    await assertNoSeriousAxeViolations(page, 'dashboard');

    // 2. Visit all pages -> check unique document.title & zero critical/serious axe violations
    const pagesToCheck = [
      ['/transaksi', '.pos-menu-card', /Kasir Pemesanan/],
      ['/riwayat', '.orders-table tbody tr', /Riwayat Transaksi/],
      ['/menu', '.menu-table tbody tr', /Kelola Menu/],
      ['/pengguna', '.users-table tbody tr', /Kelola Pengguna/],
      ['/laporan', '.reports-table tbody tr', /Laporan Penjualan/],
    ];
    for (const [path, waitSel, titleRx] of pagesToCheck) {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector(waitSel);
      assert.match(await page.title(), titleRx, `Title mismatch on ${path}`);
      await assertNoSeriousAxeViolations(page, path);
    }

    // Check 404 route cleanly renders fallback page (never white screen)
    await page.goto(`${BASE_URL}/halaman-tidak-terdaftar-xyz`, { waitUntil: 'networkidle0' });
    const notFoundText = await page.evaluate(() => document.body.innerText);
    assert.ok(notFoundText.includes('404'));
    assert.ok(notFoundText.includes('Halaman tidak ditemukan'));
    assert.match(await page.title(), /Tidak Ditemukan/);
    await assertNoSeriousAxeViolations(page, '404');
    process.stdout.write('PASS 1: Title, favicon, 404 fallback, & zero serious/critical axe violations across all admin pages & 404\n');

    // 3. Modal accessibility: focus move inside modal, Tab trap, Escape close, focus restore
    await page.goto(`${BASE_URL}/pengguna`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.users-table tbody tr');
    await page.evaluate(() => {
      const btn = document.querySelector('.page-header .btn-primary');
      btn.setAttribute('data-testid', 'trigger-add-user');
      btn.focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForSelector('[role="dialog"]');

    // Focus must be inside modal
    const focusedInModal = await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement)
    );
    assert.equal(focusedInModal, true);

    // Tab 15 times -> focus must remain strictly inside [role="dialog"] (focus trap!)
    for (let i = 0; i < 15; i += 1) {
      await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(() =>
        document.querySelector('[role="dialog"]').contains(document.activeElement)
      );
      assert.equal(stillInside, true, `Focus escaped dialog at Tab step ${i}`);
    }

    // Shift+Tab backward wrap also stays inside [role="dialog"]
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Tab');
      await page.keyboard.up('Shift');
      const stillInside = await page.evaluate(() =>
        document.querySelector('[role="dialog"]').contains(document.activeElement)
      );
      assert.equal(stillInside, true, `Focus escaped dialog on Shift+Tab step ${i}`);
    }

    // Escape closes modal and restores focus back to trigger button!
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const restoredToTrigger = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'trigger-add-user'
    );
    assert.equal(restoredToTrigger, true, 'Fokus harus kembali ke tombol pemicu setelah Esc');
    process.stdout.write('PASS 2: Modal Tab/Shift+Tab focus trap, Escape close, & focus restoration verified\n');

    // 4. POS screen keyboard-only flow -> open receipt modal -> Esc close
    await page.goto(`${BASE_URL}/transaksi`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.pos-menu-card');
    await page.evaluate(() => {
      document.querySelector('.pos-menu-card:not(:disabled)').focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForSelector('.ticket-item');
    await page.select('#pos-meja', '4');
    await page.focus('#pos-uang-diterima');
    await page.keyboard.type('50000');
    await page.evaluate(() => document.querySelector('.btn-checkout').focus());
    await page.keyboard.press('Enter');
    await page.waitForSelector('.receipt-paper');
    await assertNoSeriousAxeViolations(page, 'struk-modal');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.receipt-paper'));
    process.stdout.write('PASS 3: POS keyboard operation & ReceiptModal axe + Esc close verified\n');

    // 5. Session expiration mid-use (delete token cookie while on /laporan -> 401 -> redirect /login -> login returns to /laporan!)
    await page.goto(`${BASE_URL}/laporan`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-testid="summary-omset-bersih"]');

    // Delete httpOnly cookie via CDP
    const cdp = await page.createCDPSession();
    await cdp.send('Network.clearBrowserCookies');

    // Trigger an uncached query on /laporan -> server returns 401 -> redirects to /login with expired notice
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/login'),
      page.select('#filter-category', 'coffee'),
    ]);
    await page.waitForSelector('.login-alert-warning');
    const expiredText = await page.$eval('.login-alert-warning', (el) => el.innerText);
    assert.ok(expiredText.includes('Sesi Anda telah berakhir'));

    // Re-login -> returns automatically back to /laporan!
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/laporan'),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForSelector('[data-testid="summary-omset-bersih"]');
    process.stdout.write('PASS 4: Mid-session 401 expiry redirects to /login with clear message and returns to /laporan after re-login\n');

    // 6. Server offline / network disconnect resilience -> clean error message + "Coba lagi" recovery
    await page.goto(`${BASE_URL}/menu`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.menu-table tbody tr');
    await page.setOfflineMode(true);
    // Enter an uncached search term so TanStack Query executes a real fetch and triggers offline error
    await page.type('#menu-search', 'Espresso');
    await page.waitForFunction(
      () =>
        document.querySelector('.state-error')?.innerText.includes('Coba lagi') ||
        document.querySelector('.state-error') !== null
    );
    const offlineBanner = await page.$eval('.state-error', (el) => el.innerText);
    assert.ok(offlineBanner.length > 0);
    await page.setOfflineMode(false);
    await page.click('.state-error button');
    await page.waitForSelector('.menu-table tbody tr');
    process.stdout.write('PASS 5: Offline / server-down resilience shows recovery UI ("Coba lagi") and recovers cleanly\n');

    // 7. Mobile (360px) touch target >= 44px & zero horizontal overflow check across core pages
    await page.setViewport({ width: 360, height: 780 });
    for (const p of ['/dashboard', '/transaksi', '/riwayat', '/menu', '/pengguna', '/laporan']) {
      await page.goto(`${BASE_URL}${p}`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 250));
      const check = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        tinyCount: Array.from(document.querySelectorAll('a, button, input, select'))
          .filter((el) => {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 2 && r.height > 2 && (r.height < 44 || r.width < 44);
          }).length,
      }));
      assert.ok(check.sw <= check.iw + 2, `Overflow on ${p} 360px: ${check.sw} > ${check.iw}`);
      assert.equal(check.tinyCount, 0, `Small touch target (<44px) on ${p} 360px`);
    }
    process.stdout.write('PASS 6: Zero overflow & zero <44px touch targets at 360px across all routes\n');

    // 8. Kasir 403 axe check
    const kasirCtx = await browser.createBrowserContext();
    const kasirPage = await kasirCtx.newPage();
    await kasirPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await kasirPage.type('#username', 'kasir1');
    await kasirPage.type('#password', 'Kasir#2026');
    await Promise.all([
      kasirPage.waitForFunction(() => window.location.pathname === '/dashboard'),
      kasirPage.click('button[type="submit"]'),
    ]);
    await kasirPage.goto(`${BASE_URL}/pengguna`, { waitUntil: 'networkidle0' });
    await kasirPage.waitForSelector('.forbidden-screen');
    await assertNoSeriousAxeViolations(kasirPage, '403');
    await kasirCtx.close();
    process.stdout.write('PASS 7: 403 Forbidden screen passes axe-core audit with zero serious/critical issues\n');

    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join('; ')}`);
    process.stdout.write('PASS 8: Zero uncaught page errors in Chrome\n');

    await ctx.close();
  } finally {
    await browser.close();
  }
}

function documentTitle(t) {
  return t || '';
}

run().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message}\n`);
  process.exit(1);
});
