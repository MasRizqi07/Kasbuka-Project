import { test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const testDbUrl = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5433/kasbuka_test';
const prisma = new PrismaClient({
  datasources: { db: { url: testDbUrl } },
});
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

test('Capture Screenshots S1 sampai S4', async ({ page }, testInfo) => {
  const vpName = testInfo.project.name === 'mobile-chrome' ? '390px' : 'desktop';

  // S1: Landing Pengurus (/)
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `screenshots/S1-landing-${vpName}.png` });

  // S2: Halaman Publik Campaign (/c/[slug])
  await page.goto(`/c/${SLUG}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `screenshots/S2-campaign-${vpName}.png` });

  // S3: Sheet Donasi (/c/[slug] dengan Sheet terbuka)
  const donateBtn = page.getByRole('button', { name: /Berdonasi Sekarang/i });
  if (await donateBtn.isVisible()) {
    await donateBtn.click();
    await page.waitForSelector('#donation-sheet-title');
    await page.screenshot({ path: `screenshots/S3-donationsheet-${vpName}.png` });
  }

  // S4: Dasbor Pengurus (/dashboard terautentikasi)
  await page.goto('/login');
  await page.fill('#login-email', EMAIL);
  await page.fill('#login-password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*dashboard/);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `screenshots/S4-dashboard-${vpName}.png` });
});

