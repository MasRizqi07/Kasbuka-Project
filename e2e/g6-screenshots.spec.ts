import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

test('Capture Gate G6 Evidence Screenshots', async ({ page }) => {
  const SLUG = 'musala-e2e-test';
  await fs.mkdir(path.join(process.cwd(), 'screenshots'), { recursive: true });

  // 1. Buka halaman publik campaign
  await page.goto(`/c/${SLUG}`);
  await page.waitForLoadState('networkidle');

  // 2. Klik tombol "Periksa keutuhan buku"
  const verifyBtn = page.getByRole('button', { name: /Periksa keutuhan/i });
  await verifyBtn.click();
  await page.waitForSelector('text=Rantai valid');

  // Ambil screenshot hasil "Periksa keutuhan" = VALID & hash terakhir
  await page.screenshot({ path: 'screenshots/G6-integrity-valid.png' });

  // 3. Cari tombol "Lihat bukti" pada baris OUT dan klik untuk membuka modal nota
  const proofBtn = page.getByRole('button', { name: /Lihat bukti/i }).first();
  await proofBtn.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await page.waitForLoadState('networkidle');

  // Ambil screenshot halaman publik dengan entri OUT dan bukti nota terbuka
  await page.screenshot({ path: 'screenshots/G6-proof-modal-open.png' });
});
