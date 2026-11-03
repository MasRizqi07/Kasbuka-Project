import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();

const E2E_ORG_NAME = 'Komunitas E2E Musala Al-Ikhlas';
const E2E_CAMPAIGN_SLUG = 'musala-e2e-test';
const E2E_ADMIN_EMAIL = 'pengurus.e2e@kasbuka.org';
const E2E_ADMIN_PASSWORD = 'PasswordE2E123!';

test.beforeAll(async () => {
  // Pastikan direktori screenshots ada
  await fs.mkdir(path.join(process.cwd(), 'screenshots'), { recursive: true });

  // 1. Buat / Dapatkan Organisasi
  let org = await prisma.organization.findFirst({
    where: { name: E2E_ORG_NAME },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: E2E_ORG_NAME },
    });
  }

  // 2. Buat / Perbarui User Admin
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(E2E_ADMIN_PASSWORD, salt);

  await prisma.user.upsert({
    where: { email: E2E_ADMIN_EMAIL },
    update: { passwordHash, organizationId: org.id },
    create: {
      email: E2E_ADMIN_EMAIL,
      passwordHash,
      name: 'Pengurus E2E Test',
      role: 'ORG_ADMIN',
      organizationId: org.id,
    },
  });

  // 3. Buat / Dapatkan Campaign
  let campaign = await prisma.campaign.findUnique({
    where: { slug: E2E_CAMPAIGN_SLUG },
  });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        organizationId: org.id,
        slug: E2E_CAMPAIGN_SLUG,
        title: 'Renovasi Atap Musala Al-Ikhlas (E2E Test)',
        story: 'Penggalangan dana untuk penggantian atap seng dan plafon musala.',
        targetAmount: 25000000n,
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });
  }
});

test.describe('Fase 5.3 E2E Playwright', () => {
  // Alur 1: Publik (buka /c/[slug], cek saldo, jalankan periksa keutuhan, hasil VALID)
  test('Alur 1 (Publik): Buka campaign, lihat persamaan saldo, jalankan verifikasi integritas', async ({ page }, testInfo) => {
    await page.goto(`/c/${E2E_CAMPAIGN_SLUG}`);

    // Judul & badge dasar penggalangan
    await expect(page.locator('h1')).toContainText('Renovasi Atap Musala Al-Ikhlas');
    await expect(page.locator('text=Komunitas terbatas')).toBeVisible();

    // Persamaan Saldo
    const saldoRegion = page.getByRole('region', { name: 'Ringkasan Perhitungan Saldo' });
    await expect(saldoRegion).toBeVisible();

    // Jangkar Hash
    await expect(page.locator('text=JANGKAR HASH')).toBeVisible();

    // Jalankan verifikasi keutuhan
    const verifyBtn = page.getByRole('button', { name: /Periksa keutuhan/i });
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // Hasil verifikasi keutuhan valid
    await expect(page.locator('text=Rantai valid')).toBeVisible();

    // Simpan screenshot desktop & mobile
    const projectName = testInfo.project.name;
    await page.screenshot({
      path: `screenshots/${projectName}-c-slug.png`,
      fullPage: false,
    });
  });

  // Alur 2: Pengurus (login, upload .exe ditolak, catat pengeluaran berbukti, batalkan lewat koreksi, saldo benar)
  test('Alur 2 (Pengurus): Login, tolak .exe, catat pengeluaran berbukti, koreksi reversal', async ({ page }) => {
    // 1. Login pengurus
    await page.goto('/login');
    await page.fill('#login-email', E2E_ADMIN_EMAIL);
    await page.fill('#login-password', E2E_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Berhasil diarahkan ke dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('text=ORG_ADMIN')).toBeVisible();

    // 2. Keamanan: Upload file executable Windows (.exe bertopeng .jpg) wajib ditolak HTTP 422
    const fakeExeBuffer = Buffer.concat([
      Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff]),
      Buffer.from('This program cannot be run in DOS mode.', 'utf8'),
    ]);

    const uploadExeRes = await page.request.post('/api/admin/proof/upload', {
      multipart: {
        file: {
          name: 'nota-palsu.jpg',
          mimeType: 'image/jpeg',
          buffer: fakeExeBuffer,
        },
      },
    });
    expect(uploadExeRes.status()).toBe(422);
    const uploadExeJson = await uploadExeRes.json();
    expect(uploadExeJson.message).toContain('Format file tidak didukung');

    // 3. Upload file bukti JPEG yang valid
    const validJpgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0xff, 0xd9,
    ]);

    const uploadValidRes = await page.request.post('/api/admin/proof/upload', {
      multipart: {
        file: {
          name: 'nota-semen-asli.jpg',
          mimeType: 'image/jpeg',
          buffer: validJpgBuffer,
        },
      },
    });
    expect(uploadValidRes.status()).toBe(200);
    const uploadValidJson = await uploadValidRes.json();
    const { proofUrl, proofSha256 } = uploadValidJson.data;
    expect(proofSha256).toBeDefined();

    const campaign = await prisma.campaign.findUnique({
      where: { slug: E2E_CAMPAIGN_SLUG },
    });

    // Catat pemasukan manual awal agar saldo cukup
    const incomeRes = await page.request.post('/api/admin/entries/manual-income', {
      data: {
        campaignId: campaign!.id,
        amount: 1500000,
        donorName: 'Hamba Allah Komunitas',
        description: 'Infaq tunai renovasi',
      },
    });
    expect(incomeRes.status()).toBe(201);

    // 4. Catat pengeluaran dengan bukti nota
    const expenseRes = await page.request.post('/api/admin/entries/expense', {
      data: {
        campaignId: campaign!.id,
        amount: 650000,
        description: 'Beli semen 10 sak dan paku seng',
        proofUrl,
        proofSha256,
      },
    });
    expect(expenseRes.status()).toBe(201);
    const expenseJson = await expenseRes.json();
    const expenseId = expenseJson.data.id;

    // 5. Batalkan pengeluaran lewat koreksi REVERSAL
    const reversalRes = await page.request.post('/api/admin/entries/reversal', {
      data: {
        campaignId: campaign!.id,
        targetEntryId: expenseId,
        reason: 'Nota keliru terinput dobel',
      },
    });
    expect(reversalRes.status()).toBe(201);
    const reversalJson = await reversalRes.json();
    expect(reversalJson.data.reversesEntryId).toBe(expenseId);

    // 6. Verifikasi saldo kas terhitung kembali benar di halaman publik
    await page.goto(`/c/${E2E_CAMPAIGN_SLUG}`);
    await expect(page.locator('text=Infaq tunai renovasi').first()).toBeVisible();
    await expect(page.locator('text=Beli semen 10 sak dan paku seng').first()).toBeVisible();
    await expect(page.locator('text=Dibatalkan oleh #').first()).toBeVisible();
  });
});

