import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:5173';
const OUT_DIR = path.resolve(__dirname, '../../../docs/screenshots');

async function capture() {
  console.log('Launching Chrome from:', CHROME_PATH);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  // Explicitly ensure logged out by visiting dashboard first; if logged in, click Keluar
  console.log('Navigating to check session state...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });

  // If redirected to dashboard, click logout
  if (page.url().includes('/dashboard')) {
    console.log('Currently authenticated, logging out...');
    await page.waitForSelector('button.btn-logout', { timeout: 5000 });
    await page.click('button.btn-logout');
    await new Promise(r => setTimeout(r, 1500));
  }

  // 1. Login page
  console.log('Capturing login.png...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#username', { visible: true, timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'login.png') });
  console.log('Saved login.png');

  // 2. Perform Login as Admin
  console.log('Logging in as admin...');
  await page.type('#username', 'admin');
  await page.type('#password', 'Admin#2026');
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForSelector('.kpi-hero-card, .dashboard-container', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'dashboard.png') });
  console.log('Saved dashboard.png');

  // 3. Kasir / POS page (/transaksi)
  console.log('Capturing kasir.png...');
  await page.goto(`${BASE_URL}/transaksi`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.pos-menu-card', { visible: true, timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'kasir.png') });
  console.log('Saved kasir.png');

  // 4. Struk / Orders modal (/riwayat)
  console.log('Capturing struk.png...');
  await page.goto(`${BASE_URL}/riwayat`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('table tbody tr', { visible: true, timeout: 10000 });
  
  const printBtn = await page.waitForSelector('table button.btn-action', { visible: true });
  await printBtn.click();
  await page.waitForSelector('.receipt-paper', { visible: true, timeout: 10000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'struk.png') });
  console.log('Saved struk.png');

  // 5. Laporan page (/laporan)
  console.log('Capturing laporan.png...');
  await page.keyboard.press('Escape');
  await page.goto(`${BASE_URL}/laporan`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.reports-container, .reports-table, .summary-hero-card', { visible: true, timeout: 10000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'laporan.png') });
  console.log('Saved laporan.png');

  await browser.close();
  console.log('All 5 screenshots updated successfully in docs/screenshots!');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
