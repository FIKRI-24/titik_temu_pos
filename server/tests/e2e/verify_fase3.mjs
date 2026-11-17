// server/tests/e2e/verify_fase3.mjs
// End-to-End verification for Fase 3 (POS Cashier, Voucher, Idempotency, Price Change Authority, Print Preview 80mm/58mm/A4, History, Cancellation, Concurrency)

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

    // 2. Add 5 distinct items to cart, long 60-char customer name & long 120-char note
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

    await page.waitForFunction(() => document.querySelectorAll('.ticket-item').length === 5);

    const longNote = 'Less sugar, Extra ice, Mohon disajikan terpisah dengan sedotan kertas tambahan 1234567890';
    await page.type('.ticket-item:first-child .ticket-note-row input', longNote);

    await page.select('#pos-meja', '7');
    const longCustomer = 'Pelanggan Spesial Titik Temu Kopi Cabang Jakarta Selatan';
    await page.type('#pos-pemesan', longCustomer);

    await page.type('#pos-voucher', 'HEMAT10');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/vouchers/validate')),
      page.click('.voucher-form button[type="submit"]'),
    ]);
    await page.waitForFunction(() => document.body.innerText.includes('Diskon (HEMAT10)'));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.quick-cash-btn'));
      btns.find((b) => b.innerText.includes('200')).click();
    });
    await page.waitForSelector('.change-ok');

    const [order1Resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/orders') && r.request().method() === 'POST'),
      page.click('.btn-checkout'),
    ]);
    assert.equal(order1Resp.status(), 201);
    const order1Data = await order1Resp.json();
    const inv1 = order1Data.data.order.invoice_number;
    // Today already has 4 seeded orders -> first new order today is -0005!
    assert.match(inv1, /^INV-POS-\d{8}-0005$/);
    assert.equal(order1Data.data.order.total_subtotal, 150000);
    assert.equal(order1Data.data.order.diskon_nominal, 15000);
    assert.equal(order1Data.data.order.pajak_nominal, 13500);
    assert.equal(order1Data.data.order.grand_total, 148500);
    assert.equal(order1Data.data.order.uang_kembali, 51500);

    // 3. Verify Receipt Modal, long-text wrapping, & Print Preview PDF (80mm, 58mm, A4)
    await page.waitForSelector('.receipt-paper');
    const receiptText = await page.$eval('.receipt-paper', (el) => el.innerText);
    assert.ok(receiptText.includes(inv1));
    assert.ok(receiptText.includes('Meja 7'));
    assert.ok(receiptText.includes('HEMAT10'));

    // Check print CSS media visibility + generate PDFs on 80mm, 58mm, A4
    await page.emulateMediaType('print');
    const printVisibility = await page.evaluate(() => {
      const sidebar = document.querySelector('.app-sidebar');
      const toolbar = document.querySelector('.receipt-toolbar');
      const paper = document.querySelector('.receipt-paper');
      return {
        sidebarVis: getComputedStyle(sidebar).visibility,
        toolbarDisplay: getComputedStyle(toolbar).display,
        paperVis: getComputedStyle(paper).visibility,
      };
    });
    assert.equal(printVisibility.sidebarVis, 'hidden');
    assert.equal(printVisibility.toolbarDisplay, 'none');
    assert.equal(printVisibility.paperVis, 'visible');
    await page.emulateMediaType('screen');

    // Test 80mm PDF
    const pdf80 = await page.pdf({ width: '80mm', height: '210mm', printBackground: true });
    assert.ok(pdf80.length > 1000, '80mm receipt PDF should be generated');

    // Test 58mm PDF + verify zero horizontal overflow with long text
    await page.click('.paper-size-group button:nth-child(2)');
    await page.waitForSelector('.receipt-size-58mm');
    const overflow58 = await page.$eval('.receipt-size-58mm', (el) => el.scrollWidth > el.clientWidth + 2);
    assert.equal(overflow58, false, '58mm receipt should wrap long text without horizontal overflow');
    const pdf58 = await page.pdf({ width: '58mm', height: '210mm', printBackground: true });
    assert.ok(pdf58.length > 1000, '58mm receipt PDF should be generated');

    // Test A4 PDF
    await page.click('.paper-size-group button:nth-child(3)');
    await page.waitForSelector('.receipt-size-a4');
    const pdfA4 = await page.pdf({ format: 'A4', printBackground: true });
    assert.ok(pdfA4.length > 1000, 'A4 receipt PDF should be generated');

    await page.click('.receipt-actions .btn-primary'); // Pesanan baru
    await page.waitForFunction(() => !document.querySelector('.receipt-paper'));
    process.stdout.write(`PASS 1: 5-item order (${inv1}), long text wrap, & print preview PDF (80mm/58mm/A4) verified\n`);

    // 4. Price changed by admin AFTER kasir opened /transaksi:
    // Kasir sees old Americano price (Rp 25.000) in open POS tab; admin updates Americano to Rp 35.000 in separate context.
    // Kasir submits QRIS without refreshing -> server computes Rp 35.000 + PB1 3.500 = Rp 38.500, and receipt shows Rp 38.500!
    const adminCtx = await browser.createBrowserContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await adminPage.type('#username', 'admin');
    await adminPage.type('#password', 'Admin#2026');
    await Promise.all([
      adminPage.waitForFunction(() => window.location.pathname === '/dashboard'),
      adminPage.click('button[type="submit"]'),
    ]);

    const priceChangeStatus = await adminPage.evaluate(async () => {
      const res = await fetch('/api/products/2', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harga_jual: 35000 }),
      });
      return res.status;
    });
    assert.equal(priceChangeStatus, 200);

    // Kasir (without refreshing POS tab!) adds Americano and submits with QRIS
    await page.evaluate(() => {
      const toggles = Array.from(document.querySelectorAll('.toggle-btn'));
      toggles.find((b) => b.innerText.includes('Takeaway')).click();
      const cards = Array.from(document.querySelectorAll('.pos-menu-card'));
      cards.find((c) => c.innerText.includes('Americano')).click();
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
    assert.match(inv2, /^INV-POS-\d{8}-0006$/);
    assert.equal(order2Data.data.order.total_subtotal, 35000);
    assert.equal(order2Data.data.order.pajak_nominal, 3500);
    assert.equal(order2Data.data.order.grand_total, 38500);

    await page.waitForSelector('.receipt-paper');
    const receipt2Text = await page.$eval('.receipt-paper', (el) => el.innerText);
    assert.ok(receipt2Text.includes('38.500'), 'Receipt must show server-calculated grand total Rp 38.500, not stale client Rp 27.500');
    await page.click('.receipt-actions .btn-secondary');
    process.stdout.write(`PASS 2: Price change mid-session (${inv2}) uses server price Rp 35.000 -> Rp 38.500 in receipt & toast\n`);

    // 5. Idempotency-Key test via concurrent duplicate fetch
    const idemRes = await page.evaluate(async () => {
      const key = `e2e-idem-${Date.now()}`;
      const beforeStok = (await (await fetch('/api/products/1', { credentials: 'include' })).json()).data.product.stok;
      const body = JSON.stringify({
        tipe_pesanan: 'takeaway',
        items: [{ product_id: 1, kuantiti: 2 }],
        metode_bayar: 'qris',
      });
      const [r1, r2] = await Promise.all([
        fetch('/api/orders', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body,
        }).then((r) => r.json()),
        fetch('/api/orders', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body,
        }).then((r) => r.json()),
      ]);
      const afterStok = (await (await fetch('/api/products/1', { credentials: 'include' })).json()).data.product.stok;
      return {
        id1: r1.data.order.id,
        id2: r2.data.order.id,
        inv1: r1.data.order.invoice_number,
        inv2: r2.data.order.invoice_number,
        beforeStok,
        afterStok,
      };
    });
    assert.equal(idemRes.id1, idemRes.id2);
    assert.equal(idemRes.inv1, idemRes.inv2);
    assert.equal(idemRes.afterStok, idemRes.beforeStok - 2);
    process.stdout.write(`PASS 3: Concurrent Idempotency-Key created single order (${idemRes.inv1}) and deducted stock once\n`);

    // 6. Open /riwayat, cancel order 2 (Americano), verify stock restored
    await page.click('a[href="/riwayat"]');
    await page.waitForSelector('.orders-table');
    await page.waitForFunction((i2) => document.body.innerText.includes(i2), {}, inv2);

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
    const americanoStok = await page.evaluate(async () => {
      const res = await fetch('/api/products/2', { credentials: 'include' });
      return (await res.json()).data.product.stok;
    });
    assert.equal(americanoStok, 44);
    process.stdout.write('PASS 4: Order cancellation in /riwayat restored stock accurately\n');

    // 7. Concurrent last-stock race across admin & kasir
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

    // 8. Mobile 360px ticket drawer toggle
    await page.goto(`${BASE_URL}/transaksi`, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 360, height: 780 });
    await page.waitForSelector('.mobile-ticket-toggle');
    await page.click('.mobile-ticket-toggle');
    await page.waitForSelector('.pos-ticket-panel.open');
    process.stdout.write('PASS 6: Mobile POS ticket drawer toggles cleanly at 360px\n');

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
