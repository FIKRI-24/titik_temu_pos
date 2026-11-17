// server/tests/e2e/verify_fase4.mjs
// End-to-End verification for Fase 4 (Dashboard KPIs, SQL parity, Role isolation, Trend chart, Responsiveness 360/768/1440)

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

    // 1. Login as admin -> verify dashboard KPIs match seeded today orders
    // Seeded today orders:
    // #26 (kasir1, selesai): 61600
    // #27 (kasir1, selesai): 71500
    // #28 (admin, diproses): 104940
    // #29 (kasir1, diproses): 100100
    // Total cafe today = 61600 + 71500 + 104940 + 100100 = 338140 (4 orders)
    // Top menu today = Es Kopi Susu (qty 1 + 2 = 3)
    // Low stock = 2 items (Latte 7/10, Jus Alpukat 6/10)
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#username', 'admin');
    await page.type('#password', 'Admin#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);

    await page.waitForSelector('[data-testid="kpi-omset"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="kpi-omset"]').innerText.includes('338.140')
    );
    await page.waitForSelector('.recharts-bar-rectangle');
    await page.waitForSelector('.recent-table tbody tr');
    await page.waitForSelector('.cat-dist-item');

    const adminKpis = await page.evaluate(() => ({
      omset: document.querySelector('[data-testid="kpi-omset"]').innerText,
      orders: document.querySelector('[data-testid="kpi-orders"]').innerText,
      topMenu: document.querySelector('[data-testid="kpi-top-menu"]').innerText,
      lowStock: document.querySelector('[data-testid="kpi-low-stock"]').innerText,
      bars: document.querySelectorAll('.recharts-bar-rectangle').length,
      recentRows: document.querySelectorAll('.recent-table tbody tr').length,
      catItems: document.querySelectorAll('.cat-dist-item').length,
    }));

    assert.ok(adminKpis.omset.includes('338.140'));
    assert.equal(adminKpis.orders, '4');
    assert.equal(adminKpis.topMenu, 'Es Kopi Susu');
    assert.equal(adminKpis.lowStock, '2');
    assert.equal(adminKpis.bars, 7);
    assert.equal(adminKpis.recentRows, 8);
    assert.equal(adminKpis.catItems, 4);

    // Verify quick CTA "Transaksi baru" & clickable low-stock link to /menu
    const hasCta = await page.$eval('.dash-cta', (el) => el.getAttribute('href') === '/transaksi');
    assert.equal(hasCta, true);
    const hasLowStockLink = await page.$eval('.low-stock-link', (el) => el.getAttribute('href') === '/menu');
    assert.equal(hasLowStockLink, true);
    process.stdout.write('PASS 1: Admin Dashboard KPIs match seeded SQL totals (Rp 338.140, 4 orders, Es Kopi Susu, 2 low stock, 7-day chart)\n');

    // 2. Check responsive layout across 1440, 768, 360 (zero horizontal overflow)
    for (const vp of [
      { width: 1440, height: 900 },
      { width: 768, height: 900 },
      { width: 360, height: 780 },
    ]) {
      await page.setViewport(vp);
      await new Promise((r) => setTimeout(r, 400));
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
      assert.equal(overflowInfo, null, `Horizontal overflow at ${vp.width}px: ${JSON.stringify(overflowInfo)}`);
    }
    await page.setViewport({ width: 1440, height: 900 });
    process.stdout.write('PASS 2: Dashboard layout responsive without overflow at 360, 768, and 1440 px\n');

    // 3. Logout admin, login as kasir1 -> verify kasir only sees personal orders (233.200, 3 orders)
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

    await page.waitForFunction(() =>
      document.querySelector('[data-testid="kpi-omset"]')?.innerText.includes('233.200')
    );
    const kasirOrders = await page.$eval('[data-testid="kpi-orders"]', (el) => el.innerText);
    assert.equal(kasirOrders, '3');

    // Kasir API check: cannot pass query param to view cafe-wide summary
    const apiSum = await page.evaluate(async () => {
      const res = await fetch('/api/dashboard/summary?scope=cafe', { credentials: 'include' });
      return (await res.json()).data;
    });
    assert.equal(apiSum.scope, 'personal');
    assert.equal(apiSum.total_omset, 233200);
    process.stdout.write('PASS 3: Kasir Dashboard isolated to own transactions (Rp 233.200, 3 orders)\n');

    // 4. Create new order in /transaksi as kasir1 -> return to /dashboard -> verify updated KPI
    await page.click('.dash-cta');
    await page.waitForSelector('.pos-menu-grid');
    await page.evaluate(() => {
      const toggles = Array.from(document.querySelectorAll('.toggle-btn'));
      toggles.find((b) => b.innerText.includes('Takeaway')).click();
      const cards = Array.from(document.querySelectorAll('.pos-menu-card'));
      cards.find((c) => c.innerText.includes('Espresso Single')).click(); // 20000 -> +10% PB1 = 22000
      const payBtns = Array.from(document.querySelectorAll('.pay-method-btn'));
      payBtns.find((b) => b.innerText.includes('QRIS')).click();
    });
    const [orderResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/orders') && r.request().method() === 'POST'),
      page.click('.btn-checkout'),
    ]);
    assert.equal(orderResp.status(), 201);
    await page.waitForSelector('.receipt-paper');
    await page.click('.receipt-actions .btn-secondary');

    await page.click('a[href="/dashboard"]');
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="kpi-omset"]')?.innerText.includes('255.200')
    );
    const updatedCount = await page.$eval('[data-testid="kpi-orders"]', (el) => el.innerText);
    assert.equal(updatedCount, '4');
    process.stdout.write('PASS 4: Dashboard updates immediately after creating POS order (233.200 -> 255.200)\n');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(', ')}`);
    process.stdout.write('PASS 5: Zero uncaught page errors in Chrome\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  process.stderr.write(`FAILED: ${err.stack || err}\n`);
  process.exit(1);
});
