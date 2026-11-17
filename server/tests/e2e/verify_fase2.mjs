// server/tests/e2e/verify_fase2.mjs
// End-to-End verification for Fase 2 (Categories, Menu/Products, Stock Adjustments, Role Enforcement)

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

    // 1. Login as kasir1 and verify read-only UI + 403 API enforcement
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#username', 'kasir1');
    await page.type('#password', 'Kasir#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);

    await page.waitForSelector('a[href="/menu"]');
    await page.click('a[href="/menu"]');
    await page.waitForSelector('.menu-table');

    const kasirPageText = await page.$eval('.menu-page', (el) => el.innerText);
    assert.ok(!kasirPageText.includes('Tambah menu'), 'Kasir should not see Tambah menu button');
    assert.ok(!kasirPageText.includes('Kelola kategori'), 'Kasir should not see Kelola kategori button');
    assert.ok(!kasirPageText.includes('Sesuaikan stok'), 'Kasir should not see Sesuaikan stok button');
    assert.ok(kasirPageText.includes('Stok rendah'), 'Low stock marker should be visible');

    // Kasir API write endpoints must all return 403
    const kasirApiChecks = await page.evaluate(async () => {
      const checks = [
        ['POST', '/api/categories', { nama_kategori: 'Hack' }],
        ['PATCH', '/api/categories/1', { nama_kategori: 'Hack' }],
        ['DELETE', '/api/categories/1'],
        ['POST', '/api/products', { category_id: 1, kode_produk: 'X1', nama_produk: 'X', harga_jual: 1000, harga_pokok: 500, stok: 1, stok_minimum: 1, unit: 'cup' }],
        ['PATCH', '/api/products/1', { nama_produk: 'Hack' }],
        ['PATCH', '/api/products/1/stok', { mode: 'set', nilai: 99 }],
        ['DELETE', '/api/products/1'],
      ];
      const results = [];
      for (const [method, url, body] of checks) {
        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        results.push({ method, url, status: res.status });
      }
      return results;
    });
    for (const r of kasirApiChecks) {
      assert.equal(r.status, 403, `Expected 403 for kasir ${r.method} ${r.url}, got ${r.status}`);
    }
    process.stdout.write('PASS 1: Kasir API write enforcement (all 7 endpoints 403) & read-only UI verified\n');

    // Logout kasir1
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/logout')),
      page.click('.btn-logout'),
    ]);
    await page.waitForFunction(() => window.location.pathname === '/login');

    // 2. Login as admin
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);

    await page.click('a[href="/menu"]');
    await page.waitForSelector('.menu-table');

    // 3. Test search & category filter + empty state
    await page.type('#menu-search', 'MenuTidakAdaXYZ');
    await page.waitForFunction(() =>
      document.body.innerText.includes('Tidak ada menu yang cocok dengan pencarian atau filter.')
    );
    await page.click('.state-box .btn-secondary'); // Reset filter
    await page.waitForSelector('.menu-table');
    process.stdout.write('PASS 2: Search, filter, and empty state message + reset verified\n');

    // 4. Test duplicate product code (409) & negative numbers (422) via API
    const validationResults = await page.evaluate(async () => {
      const dupRes = await fetch('/api/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: 1,
          kode_produk: 'COF-001',
          nama_produk: 'Duplikat',
          harga_jual: 20000,
          harga_pokok: 8000,
          stok: 10,
          stok_minimum: 5,
          unit: 'cup',
        }),
      });

      const negPriceRes = await fetch('/api/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: 1,
          kode_produk: 'NEG-001',
          nama_produk: 'Negatif',
          harga_jual: -5000,
          harga_pokok: 1000,
          stok: 10,
          stok_minimum: 5,
          unit: 'cup',
        }),
      });

      const negMinStokRes = await fetch('/api/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: 1,
          kode_produk: 'NEG-002',
          nama_produk: 'Negatif Min',
          harga_jual: 15000,
          harga_pokok: 5000,
          stok: 10,
          stok_minimum: -1,
          unit: 'cup',
        }),
      });

      const catDelRes = await fetch('/api/categories/1', {
        method: 'DELETE',
        credentials: 'include',
      });

      const highCostNoConfirm = await fetch('/api/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: 1,
          kode_produk: 'HCOST-001',
          nama_produk: 'High Cost Unconfirmed',
          harga_jual: 10000,
          harga_pokok: 20000,
          stok: 5,
          stok_minimum: 2,
          unit: 'cup',
        }),
      });

      return {
        dupStatus: dupRes.status,
        dupBody: await dupRes.json(),
        negPriceStatus: negPriceRes.status,
        negMinStokStatus: negMinStokRes.status,
        catDelStatus: catDelRes.status,
        catDelBody: await catDelRes.json(),
        highCostStatus: highCostNoConfirm.status,
        highCostBody: await highCostNoConfirm.json(),
      };
    });

    assert.equal(validationResults.dupStatus, 409);
    assert.ok(validationResults.dupBody.error.message.includes('sudah digunakan'));
    assert.equal(validationResults.negPriceStatus, 422);
    assert.equal(validationResults.negMinStokStatus, 422);
    assert.equal(validationResults.catDelStatus, 409);
    assert.ok(validationResults.catDelBody.error.message.includes('menu aktif'));
    assert.equal(validationResults.highCostStatus, 422);
    assert.equal(validationResults.highCostBody.error.code, 'CONFIRM_HIGH_COST');
    process.stdout.write('PASS 3: Duplicate code (409), negative inputs (422), category delete protection (409), & high-cost check (422) verified\n');

    // 5. UI create menu with harga_pokok > harga_jual -> explicit confirmation modal
    await page.click('.header-actions .btn-primary');
    await page.waitForSelector('#menu-kode');
    await page.type('#menu-kode', 'UJI-HIGH');
    await page.type('#menu-nama', 'Menu Uji Margin');
    await page.type('#menu-harga-jual', '15000');
    await page.type('#menu-harga-pokok', '20000');
    await page.click('.modal-panel button[type="submit"]');
    await page.waitForSelector('#high-cost-title');
    const [createConfirmResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/products') && r.request().method() === 'POST'),
      page.click('.modal-panel:has(#high-cost-title) .btn-primary'),
    ]);
    assert.equal(createConfirmResp.status(), 201);
    await page.waitForFunction(() => document.body.innerText.includes('Menu Uji Margin'));
    process.stdout.write('PASS 4: High-cost confirmation modal in UI verified\n');

    // 6. Stock adjustment UI + concurrent API check
    const adjustBtn = await page.evaluateHandle(() => {
      const rows = Array.from(document.querySelectorAll('.menu-table tbody tr'));
      const row = rows.find((r) => r.innerText.includes('Menu Uji Margin'));
      return row.querySelector('button');
    });
    await adjustBtn.click();
    await page.waitForSelector('#stok-nilai');
    await page.type('#stok-nilai', '-5'); // initial stok was 10 -> 5
    await page.type('#stok-catatan', 'Uji selisih stok');
    const [stokResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/stok') && r.request().method() === 'PATCH'),
      page.click('.modal-panel button[type="submit"]'),
    ]);
    assert.equal(stokResp.status(), 200);
    await page.waitForFunction(() => document.body.innerText.includes('10 → 5'));
    await page.click('.modal-panel .btn-secondary'); // Close stok modal

    // Concurrent deduction on Menu Uji Margin (stok currently 5): two -3 requests -> only one succeeds
    const concResult = await page.evaluate(async () => {
      const list = await (await fetch('/api/products?q=UJI-HIGH', { credentials: 'include' })).json();
      const prod = list.data.products[0];
      const [r1, r2] = await Promise.all([
        fetch(`/api/products/${prod.id}/stok`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'selisih', nilai: -3, catatan: 'Conc 1' }),
        }),
        fetch(`/api/products/${prod.id}/stok`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'selisih', nilai: -3, catatan: 'Conc 2' }),
        }),
      ]);
      const statuses = [r1.status, r2.status].sort((a, b) => a - b);
      const after = await (await fetch(`/api/products/${prod.id}`, { credentials: 'include' })).json();
      return { statuses, finalStok: after.data.product.stok, prodId: prod.id };
    });
    assert.deepEqual(concResult.statuses, [200, 409]);
    assert.equal(concResult.finalStok, 2);
    process.stdout.write('PASS 5: Stock adjustment (UI history + concurrent FOR UPDATE lock 200/409) verified\n');

    // 7. Ordered menu cannot be permanently deleted (only deactivated) & hidden from kasir
    const orderedDeact = await page.evaluate(async () => {
      const res = await fetch('/api/products/1', { method: 'DELETE', credentials: 'include' });
      return { status: res.status, body: await res.json() };
    });
    assert.equal(orderedDeact.status, 200);
    assert.equal(orderedDeact.body.data.action, 'deactivated');
    assert.equal(orderedDeact.body.data.product.status, 'nonaktif');

    // Never-ordered menu (Menu Uji Margin) CAN be deleted cleanly
    const unusedDel = await page.evaluate(async (id) => {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
      return { status: res.status, body: await res.json() };
    }, concResult.prodId);
    assert.equal(unusedDel.status, 200);
    assert.equal(unusedDel.body.data.action, 'deleted');

    // Logout admin, login as kasir1, verify product 1 (Espresso Single) is NOT in kasir list
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/logout')),
      page.click('.btn-logout'),
    ]);
    await page.waitForFunction(() => window.location.pathname === '/login');
    await page.type('#username', 'kasir1');
    await page.type('#password', 'Kasir#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);
    const kasirProducts = await page.evaluate(async () => {
      const res = await fetch('/api/products?aktif=all', { credentials: 'include' });
      return await res.json();
    });
    assert.ok(
      !kasirProducts.data.products.some((p) => p.id === 1 || p.status === 'nonaktif'),
      'Inactive menu must NOT appear for kasir even if ?aktif=all is sent'
    );
    process.stdout.write('PASS 6: Ordered menu only deactivated (not deleted) & hidden from kasir\n');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(', ')}`);
    process.stdout.write('PASS 7: Zero uncaught page errors in Chrome\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  process.stderr.write(`FAILED: ${err.stack || err}\n`);
  process.exit(1);
});
