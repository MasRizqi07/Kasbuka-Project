import { test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();
const SLUG = 'musala-e2e-test';
const EMAIL = 'pengurus.e2e@kasbuka.org';
const PASSWORD = 'PasswordE2E123!';

test.beforeAll(async () => {
  await fs.mkdir(path.join(process.cwd(), 'screenshots'), { recursive: true });

  let org = await prisma.organization.findFirst({
    where: { name: 'Komunitas E2E Musala Al-Ikhlas' },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Komunitas E2E Musala Al-Ikhlas' },
    });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(PASSWORD, salt);

  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, organizationId: org.id },
    create: {
      email: EMAIL,
      passwordHash,
      name: 'Pengurus E2E Test',
      role: 'ORG_ADMIN',
      organizationId: org.id,
    },
  });

  await prisma.campaign.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      organizationId: org.id,
      slug: SLUG,
      title: 'Renovasi Atap Musala Al-Ikhlas',
      story: 'Penggalangan dana untuk penggantian atap seng dan plafon musala.',
      targetAmount: 25000000n,
      basis: 'TERBATAS',
      status: 'ACTIVE',
    },
  });
});

test('Capture Screenshots S1 sampai S4 (Desktop & 390px)', async ({ browser }) => {
  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: '390px', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // S1: Landing Pengurus (/)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `screenshots/S1-landing-${vp.name}.png` });

    // S2: Halaman Publik Campaign (/c/[slug])
    await page.goto(`/c/${SLUG}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `screenshots/S2-campaign-${vp.name}.png` });

    // S3: Sheet Donasi (/c/[slug] dengan Sheet terbuka)
    const donateBtn = page.getByRole('button', { name: /Berdonasi Sekarang/i });
    if (await donateBtn.isVisible()) {
      await donateBtn.click();
      await page.waitForSelector('#donation-sheet-title');
      await page.screenshot({ path: `screenshots/S3-donationsheet-${vp.name}.png` });
    }

    // S4: Dasbor Pengurus (/dashboard terautentikasi)
    await page.goto('/login');
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `screenshots/S4-dashboard-${vp.name}.png` });

    await context.close();
  }
});

