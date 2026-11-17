// server/tests/e2e/verify_fase3.mjs
// End-to-End verification for Fase 3 (POS Cashier, Voucher, Atomic Order, Receipt, History, Cancellation, Concurrency)

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

    // 1. Login as kasir1 and navigate to /transaksi
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('#username', 'kasir1');
    await page.type('#password', 'Kasir#2026');
    await Promise.all([
      page.waitForFunction(() => window.location.pathname === '/dashboard'),
      page.click('button[type="submit"]'),
    ]);

    await page.waitForSelector('a[href="/transaksi"]');
    await page.click('a[href="/transaksi"]');
    await page.waitForSelector('.pos-menu-grid');

    // 2. Add 5 distinct items to cart
    const itemsToAdd = [
      'Espresso Single',
      'Americano',
      'Cappuccino',
      'Es Kopi Susu',
      'Nasi Goreng Kafe',
    ];
    for (const itemName of itemsToAdd) {
      await page.evaluate((name) => {
        const cards = Array.from(document.querySelectorAll('.pos-menu-card'));
        const card = cards.find((c) => c.innerText.includes(name));
        card.click();
      }, itemName);
    }

    await page.waitForFunction(
      () => document.querySelectorAll('.ticket-item').length === 5
    );

    // Add quick note 'Less sugar' to first item
    await page.click('.ticket-item:first-child .note-chip');

    // Select Dine-In Meja 7 & Pemesan Andi
    await page.select('#pos-meja', '7');
    await page.type('#pos-pemesan', 'Andi');

    // Apply voucher HEMAT10
    await page.type('#pos-voucher', 'HEMAT10');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/vouchers/validate')),
      page.click('.voucher-form button[type="submit"]'),
    ]);
    await page.waitForFunction(() => document.body.innerText.includes('Diskon (HEMAT10)'));

    // Click Rp 200.000 quick cash & submit
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.quick-cash-btn'));
      const b200 = btns.find((b) => b.innerText.includes('200'));
      b200.click();
    });
    await page.waitForSelector('.change-ok');

    const [order1Resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/orders') && r.request().method() === 'POST'),
      page.click('.btn-checkout'),
    ]);
    assert.equal(order1Resp.status(), 201);
    const order1Data = await order1Resp.json();
    const inv1 = order1Data.data.order.invoice_number;
    assert.match(inv1, /^INV-POS-\d{8}-0001$/);
    // Subtotal = 20000+25000+32000+28000+45000 = 150000
    // Diskon 10% = 15000, Pajak 10% * 135000 = 13500, Grand = 148500, Kembali = 51500
    assert.equal(order1Data.data.order.total_subtotal, 150000);
    assert.equal(order1Data.data.order.diskon_nominal, 15000);
    assert.equal(order1Data.data.order.pajak_nominal, 13500);
    assert.equal(order1Data.data.order.grand_total, 148500);
    assert.equal(order1Data.data.order.uang_kembali, 51500);

    // Verify receipt modal & paper size switching
    await page.waitForSelector('.receipt-paper');
    const receiptText = await page.$eval('.receipt-paper', (el) => el.innerText);
    assert.ok(receiptText.includes(inv1));
    assert.ok(receiptText.includes('Less sugar'));
    assert.ok(receiptText.includes('Meja 7'));
    assert.ok(receiptText.includes('HEMAT10'));

    await page.click('.paper-size-group button:nth-child(2)'); // 58mm
    await page.waitForSelector('.receipt-size-58mm');
    await page.click('.paper-size-group button:nth-child(1)'); // 80mm

    // Click Pesanan baru
    await page.click('.receipt-actions .btn-primary');
    await page.waitForFunction(() => !document.querySelector('.receipt-paper'));
    process.stdout.write(`PASS 1: 5-item Dine-In order (${inv1}), voucher HEMAT10, PB1 10%, change, and 80mm/58mm receipt verified\n`);

    // 3. Create Takeaway QRIS order (no table required, sequential invoice -0002)
    await page.evaluate(() => {
      const toggles = Array.from(document.querySelectorAll('.toggle-btn'));
      toggles.find((b) => b.innerText.includes('Takeaway')).click();
    });
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.pos-menu-card'));
      cards.find((c) => c.innerText.includes('Americano')).click();
    });
    await page.evaluate(() => {
      const payBtns = Array.from(document.querySelectorAll('.pay-method-btn'));
      payBtns.find((b) => b.innerText.includes('QRIS')).click();
    });
    const [order2Resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/orders') && r.request().method() === 'POST'),
      page.click('.btn-checkout'),
    ]);
    assert.equal(order2Resp.status(), 201);
    const order2Data = await order2Resp.json();
    const inv2 = order2Data.data.order.invoice_number;
    assert.match(inv2, /^INV-POS-\d{8}-0002$/);
    assert.equal(order2Data.data.order.uang_dibayar, order2Data.data.order.grand_total);
    assert.equal(order2Data.data.order.uang_kembali, 0);

    await page.waitForSelector('.receipt-paper');
    await page.click('.receipt-actions .btn-secondary'); // Tutup
    process.stdout.write(`PASS 2: Takeaway QRIS order (${inv2}) sequential invoice verified\n`);

    // 4. Verify server validation rejections (dine-in no table -> 422, cash short -> 422, over-stock -> 409)
    const apiRejections = await page.evaluate(async () => {
      const rNoTable = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipe_pesanan: 'dine_in',
          items: [{ product_id: 1, kuantiti: 1 }],
          metode_bayar: 'qris',
        }),
      });
      const rShortCash = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipe_pesanan: 'takeaway',
          items: [{ product_id: 1, kuantiti: 1 }],
          metode_bayar: 'tunai',
          uang_dibayar: 5000,
        }),
      });
      const rOverStock = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipe_pesanan: 'takeaway',
          items: [{ product_id: 5, kuantiti: 999 }],
          metode_bayar: 'qris',
        }),
      });
      return {
        noTable: rNoTable.status,
        shortCash: rShortCash.status,
        overStock: rOverStock.status,
      };
    });
    assert.equal(apiRejections.noTable, 422);
    assert.equal(apiRejections.shortCash, 422);
    assert.equal(apiRejections.overStock, 409);
    process.stdout.write('PASS 3: Server order validations (422 no table, 422 short cash, 409 insufficient stock) verified\n');

    // 5. Open /riwayat, test reprint receipt & cancel order 2 (stock restored)
    await page.click('a[href="/riwayat"]');
    await page.waitForSelector('.orders-table');
    await page.waitForFunction((i2) => document.body.innerText.includes(i2), {}, inv2);

    // Cancel inv2
    const cancelBtn = await page.evaluateHandle((inv) => {
      const rows = Array.from(document.querySelectorAll('.orders-table tbody tr'));
      const row = rows.find((r) => r.innerText.includes(inv));
      const btns = Array.from(row.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Batalkan'));
    }, inv2);
    await cancelBtn.click();
    await page.waitForSelector('#cancel-order-title');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/status') && r.request().method() === 'PATCH'),
      page.click('.modal-panel .btn-danger'),
    ]);
    await page.waitForFunction(
      (inv) => {
        const rows = Array.from(document.querySelectorAll('.orders-table tbody tr'));
        const row = rows.find((r) => r.innerText.includes(inv));
        return row && row.innerText.includes('Dibatalkan');
      },
      {},
      inv2
    );

    // Check Americano stock restored (was 45 -> 44 after order 1 -> 43 after order 2 -> 44 after cancel)
    const americanoAfterCancel = await page.evaluate(async () => {
      const res = await fetch('/api/products/2', { credentials: 'include' });
      return (await res.json()).data.product.stok;
    });
    assert.equal(americanoAfterCancel, 44);
    process.stdout.write('PASS 4: Order cancellation in /riwayat restored stock accurately\n');

    // 6. Concurrent last-stock order race across two separate browser contexts (admin + kasir1)
    const adminCtx = await browser.createBrowserContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await adminPage.type('#username', 'admin');
    await adminPage.type('#password', 'Admin#2026');
    await Promise.all([
      adminPage.waitForFunction(() => window.location.pathname === '/dashboard'),
      adminPage.click('button[type="submit"]'),
    ]);

    const tempProdId = await adminPage.evaluate(async () => {
      const res = await fetch('/api/products', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: 1,
          kode_produk: `RACE-${Date.now()}`,
          nama_produk: 'Menu Stok Terakhir E2E',
          harga_jual: 20000,
          harga_pokok: 8000,
          stok: 1,
          stok_minimum: 1,
          unit: 'cup',
        }),
      });
      return (await res.json()).data.product.id;
    });

    const [rAdmin, rKasir] = await Promise.all([
      adminPage.evaluate(
        (pid) =>
          fetch('/api/orders', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipe_pesanan: 'takeaway',
              items: [{ product_id: pid, kuantiti: 1 }],
              metode_bayar: 'qris',
            }),
          }).then((r) => r.status),
        tempProdId
      ),
      page.evaluate(
        (pid) =>
          fetch('/api/orders', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipe_pesanan: 'takeaway',
              items: [{ product_id: pid, kuantiti: 1 }],
              metode_bayar: 'qris',
            }),
          }).then((r) => r.status),
        tempProdId
      ),
    ]);
    assert.deepEqual([rAdmin, rKasir].sort((a, b) => a - b), [201, 409]);
    await adminCtx.close();
    process.stdout.write('PASS 5: Two concurrent browsers ordering last remaining stock: one 201, one 409\n');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(', ')}`);
    process.stdout.write('PASS 6: Zero uncaught page errors in Chrome\n');

    // 7. Verify mobile responsive ticket drawer at 360px
    await page.goto(`${BASE_URL}/transaksi`, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 360, height: 780 });
    await page.waitForSelector('.mobile-ticket-toggle');
    await page.click('.mobile-ticket-toggle');
    await page.waitForSelector('.pos-ticket-panel.open');
    process.stdout.write('PASS 7: Mobile POS ticket drawer toggles cleanly at 360px\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  process.stderr.write(`FAILED: ${err.stack || err}\n`);
  process.exit(1);
});
