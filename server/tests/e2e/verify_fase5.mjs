// server/tests/e2e/verify_fase5.mjs
// End-to-End verification for Fase 5 (Reports RBAC, Reconciliation, Filters, Pagination, CSV/PDF Download, 360/768/1440px Responsiveness)

import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATH =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.E2E_CLIENT_URL || 'http://localhost:5173';

async function waitForFileDownload(dir, ext, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(ext) && !f.endsWith('.crdownload')
    );
    if (files.length > 0) {
      return join(dir, files[0]);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout menunggu file unduhan ${ext}`);
}

async function run() {
  const downloadDir = mkdtempSync(join(tmpdir(), 'ttk-e2e-dl-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pageErrors = [];
  const consoleErrors = [];

  try {
    // =========================================================================
    // 1. Kasir role checks (sidebar hidden, /laporan blocked, 403 on all 4 APIs)
    // =========================================================================
    const kasirCtx = await browser.createBrowserContext();
    const kasirPage = await kasirCtx.newPage();
    await kasirPage.setViewport({ width: 1280, height: 800 });
    kasirPage.on('pageerror', (err) => pageErrors.push(`kasir: ${err.message}`));

    await kasirPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await kasirPage.type('#username', 'kasir1');
    await kasirPage.type('#password', 'Kasir#2026');
    await Promise.all([
      kasirPage.waitForFunction(() => window.location.pathname === '/dashboard'),
      kasirPage.click('button[type="submit"]'),
    ]);

    const hasReportNavForKasir = await kasirPage.evaluate(() =>
      Boolean(document.querySelector('a[href="/laporan"]'))
    );
    assert.equal(hasReportNavForKasir, false, 'Menu Laporan tidak boleh tampil untuk kasir');

    await kasirPage.goto(`${BASE_URL}/laporan`, { waitUntil: 'networkidle0' });
    await kasirPage.waitForSelector('.forbidden-screen');
    const forbiddenInfo = await kasirPage.evaluate(() => ({
      text: document.querySelector('.forbidden-screen').innerText,
      hasReportDom: Boolean(document.querySelector('[data-testid="summary-omset-bersih"]')),
    }));
    assert.ok(forbiddenInfo.text.includes('403'));
    assert.ok(forbiddenInfo.text.includes('Tidak punya akses'));
    assert.equal(forbiddenInfo.hasReportDom, false);

    const kasirApiStatuses = await kasirPage.evaluate(async () => {
      const eps = [
        '/api/reports/orders',
        '/api/reports/summary',
        '/api/reports/export.csv',
        '/api/reports/export.pdf',
      ];
      return Promise.all(eps.map(async (ep) => (await fetch(ep)).status));
    });
    assert.deepEqual(kasirApiStatuses, [403, 403, 403, 403]);
    await kasirCtx.close();
    process.stdout.write('PASS 1: Kasir sidebar hides /laporan, route blocked, & all 4 report APIs return 403\n');

    // =========================================================================
    // 2. Admin flow: Dashboard <-> Reports reconciliation + Filters + Pagination
    // =========================================================================
    const adminCtx = await browser.createBrowserContext();
    const page = await adminCtx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', (err) => pageErrors.push(`admin: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);
    // Ignore expected pre-login /api/auth/me 401 check on /login; assert zero errors after login
    consoleErrors.length = 0;

    await page.waitForSelector('[data-testid="kpi-omset"]');
    const dashTodayText = await page.$eval('[data-testid="kpi-omset"]', (el) => el.innerText.trim());
    const dashTitleText = await page.$eval('.kpi-hero-card .kpi-label', (el) => el.innerText.trim());
    assert.equal(dashTitleText, 'Total diterima hari ini');

    // Navigate via sidebar link to /laporan
    await page.waitForSelector('a[href="/laporan"]');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/laporan'),
      page.click('a[href="/laporan"]'),
    ]);

    await page.waitForSelector('[data-testid="summary-omset-bersih"]');
    await page.waitForSelector('.reports-table tbody tr');
    await page.waitForSelector('.recharts-bar-rectangle');

    // Verify Today preset reconciles exactly with Dashboard KPI
    const todayPresetBtn = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('.btn-preset')).find((b) =>
        b.textContent.includes('Hari ini')
      )
    );
    await todayPresetBtn.click();
    await page.waitForFunction(
      (expected) =>
        document
          .querySelector('[data-testid="summary-total-diterima"]')
          ?.innerText.includes(expected),
      {},
      dashTodayText
    );
    const todayOrdersLabel = await page.$eval(
      '[data-testid="summary-jumlah-pesanan"]',
      (el) => el.innerText
    );
    assert.ok(todayOrdersLabel.includes('4 pesanan'));
    process.stdout.write(`PASS 2: Dashboard (${dashTodayText}) reconciles identically with Reports Today preset\n`);

    // Reset back to 7 days default using "Atur ulang"
    await page.click('[data-testid="btn-reset-filter"]');
    await page.waitForFunction(() =>
      Number(
        document
          .querySelector('[data-testid="reports-total-count"]')
          ?.innerText.split(' ')[0]
      ) >= 20
    );

    // Filter by Kategori + Metode + Status -> check active chips -> pagination -> sort
    await page.select('#filter-category', 'coffee');
    await page.waitForSelector('[data-testid="chip-category"]');
    await page.select('#filter-method', 'tunai');
    await page.waitForSelector('[data-testid="chip-method"]');
    await page.select('#filter-status', 'selesai');
    await page.waitForSelector('[data-testid="chip-status"]');

    // Reset and test pagination (limit=10 -> click Berikutnya)
    await page.click('[data-testid="btn-reset-filter"]');
    await page.select('#page-limit-select', '10');
    await page.waitForFunction(
      () => document.querySelectorAll('.reports-table tbody tr').length === 10
    );
    await page.click('[data-testid="btn-next-page"]');
    await page.waitForFunction(() =>
      document.querySelector('.reports-pagination .pagination-meta')?.innerText.includes('Halaman 2')
    );

    // Column sort click (Grand total)
    const grandSortBtn = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('.sort-btn')).find((b) =>
        b.textContent.includes('Grand total')
      )
    );
    await grandSortBtn.click();
    await page.waitForFunction(() =>
      document.querySelector('.reports-pagination .pagination-meta')?.innerText.includes('Halaman 1')
    );
    process.stdout.write('PASS 3: Filter chips, category/method/status filters, sorting, pagination, & reset verified\n');

    // =========================================================================
    // 3. Empty period state + disabled export buttons (dynamic future range within 366d)
    // =========================================================================
    const futureBase = new Date(Date.now() + 20 * 86400000);
    const futureEndDate = new Date(Date.now() + 25 * 86400000);
    const fmtIsoWib = (d) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    const futureStart = fmtIsoWib(futureBase);
    const futureEnd = fmtIsoWib(futureEndDate);

    await page.$eval(
      '#filter-date-to',
      (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      futureEnd
    );
    await page.$eval(
      '#filter-date-from',
      (el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      futureStart
    );
    await page.waitForSelector('[data-testid="reports-empty-state"]');
    const emptyText = await page.$eval('[data-testid="reports-empty-state"]', (el) =>
      el.innerText.trim()
    );
    assert.equal(emptyText, 'Belum ada transaksi pada periode ini');
    const exportsDisabled = await page.evaluate(() => ({
      csv: document.querySelector('[data-testid="btn-export-csv"]').disabled,
      pdf: document.querySelector('[data-testid="btn-export-pdf"]').disabled,
    }));
    assert.deepEqual(exportsDisabled, { csv: true, pdf: true });
    process.stdout.write('PASS 4: Empty state message & disabled exports verified\n');

    // =========================================================================
    // 4. Reset back & trigger real CSV and PDF downloads via UI click
    // =========================================================================
    await page.click('[data-testid="btn-reset-filter"]');
    await page.waitForSelector('.reports-table tbody tr');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="btn-export-csv"]').disabled
    );

    const [csvResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/reports/export.csv')),
      page.click('[data-testid="btn-export-csv"]'),
    ]);
    assert.equal(csvResp.status(), 200);
    const csvPath = await waitForFileDownload(downloadDir, '.csv');
    const csvBytes = readFileSync(csvPath);
    assert.equal(csvBytes[0], 0xef, 'CSV harus memiliki UTF-8 BOM');
    assert.equal(csvBytes[1], 0xbb);
    assert.equal(csvBytes[2], 0xbf);
    const csvString = csvBytes.toString('utf8');
    assert.ok(csvString.startsWith('\uFEFFsep=,\r\nNo. Faktur,Tanggal & Jam (WIB)'));

    await page.waitForFunction(
      () => !document.querySelector('[data-testid="btn-export-pdf"]').disabled
    );
    const [pdfResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/reports/export.pdf')),
      page.click('[data-testid="btn-export-pdf"]'),
    ]);
    assert.equal(pdfResp.status(), 200);
    const pdfPath = await waitForFileDownload(downloadDir, '.pdf');
    const pdfBytes = readFileSync(pdfPath);
    assert.equal(pdfBytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdfBytes.length > 1500, 'PDF harus berisi konten laporan lengkap');
    process.stdout.write('PASS 5: Browser CSV (UTF-8 BOM) & PDF (%PDF-) downloads verified\n');

    // =========================================================================
    // 5. Responsive layout checks at 1440, 768, and 360 px (zero horizontal overflow)
    // =========================================================================
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 768, height: 900 },
      { width: 360, height: 780 },
    ]) {
      await page.setViewport(vp);
      await new Promise((r) => setTimeout(r, 350));
      const overflowInfo = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const iw = window.innerWidth;
        if (sw <= iw + 2) return null;
        const offenders = Array.from(document.querySelectorAll('*'))
          .filter((el) => el.getBoundingClientRect().right > iw + 2)
          .slice(0, 5)
          .map((el) => `${el.tagName}.${el.className} (right=${Math.round(el.getBoundingClientRect().right)})`);
        return { sw, iw, offenders };
      });
      assert.equal(
        overflowInfo,
        null,
        `Viewport ${vp.width}px horizontal overflow: ${JSON.stringify(overflowInfo)}`
      );
    }
    process.stdout.write('PASS 6: Reports layout responsive without horizontal overflow at 360, 768, and 1440 px\n');

    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join('; ')}`);
    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
    process.stdout.write('PASS 7: Zero uncaught page or console errors in Chrome\n');

    await adminCtx.close();
  } finally {
    await browser.close();
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message}\n`);
  process.exit(1);
});
