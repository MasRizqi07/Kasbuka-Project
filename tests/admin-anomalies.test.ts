import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const { testPrisma } = vi.hoisted(() => {
  const dbUrl = process.env.DATABASE_URL_TEST;
  if (!dbUrl) {
    throw new Error('DATABASE_URL_TEST wajib disetel ke kasbuka_test untuk tes integrasi.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('@prisma/client');
  return {
    testPrisma: new PrismaClient({
      datasources: { db: { url: dbUrl } },
    }),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: testPrisma,
}));

import { GET } from '@/app/api/admin/anomalies/route';
import { hashSessionToken } from '@/lib/auth';

const prisma = testPrisma;

describe('Admin Anomalies Visibility API /api/admin/anomalies (Aturan 8.5 K)', () => {
  let orgId1: string;
  let orgId2: string;
  let adminUserId: string;
  let sessionRawToken: string;

  beforeEach(async () => {
    // Bersihkan data lama
    await prisma.$executeRawUnsafe('TRUNCATE "Organization", "User", "Session", "Campaign", "Donation", "WebhookEvent" CASCADE;');

    // Buat Organisasi 1 (Admin kita)
    const org1 = await prisma.organization.create({
      data: { name: 'Organisasi Pilot A' },
    });
    orgId1 = org1.id;

    // Buat Organisasi 2 (Organisasi lain)
    const org2 = await prisma.organization.create({
      data: { name: 'Organisasi Luar B' },
    });
    orgId2 = org2.id;

    // Buat Admin User Organisasi 1
    const user = await prisma.user.create({
      data: {
        email: 'admin.anomali@kasbuka.org',
        passwordHash: '$2a$12$eXampleHashedPasswordxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        organizationId: orgId1,
        role: 'ORG_ADMIN',
      },
    });
    adminUserId = user.id;

    // Buat Sesi valid dengan token hash (Aturan 8.2 C)
    sessionRawToken = 'raw-test-session-token-for-anomalies';
    const hashed = hashSessionToken(sessionRawToken);
    await prisma.session.create({
      data: {
        token: hashed,
        userId: adminUserId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Menolak permintaan tanpa autentikasi (401)', async () => {
    const req = new Request('http://localhost:3000/api/admin/anomalies', {
      method: 'GET',
    });

    const res = await GET(req as any, { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it('2. Mengembalikan count: 0 saat tidak ada WebhookEvent ANOMALY', async () => {
    const req = new Request('http://localhost:3000/api/admin/anomalies', {
      method: 'GET',
      headers: {
        Cookie: `kasbuka_session=${sessionRawToken}`,
      },
    });

    const res = await GET(req as any, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(0);
    expect(json.anomalies).toEqual([]);
  });

  it('3. Menampilkan daftar anomali berstatus ANOMALY dengan orderId, status, dan waktu ke dasbor admin', async () => {
    // Buat campaign & donasi di Org 1
    const campaign1 = await prisma.campaign.create({
      data: {
        organizationId: orgId1,
        slug: 'campaign-anomali-test',
        title: 'Campaign Uji Anomali',
        story: 'Testing anomali order',
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });

    const orderIdOrg1 = 'KSB-ANOMALY-001';
    await prisma.donation.create({
      data: {
        campaignId: campaign1.id,
        orderId: orderIdOrg1,
        amount: 50000n,
        status: 'EXPIRED', // Donasi sudah expired
      },
    });

    // Catat WebhookEvent dengan status ANOMALY
    await prisma.webhookEvent.create({
      data: {
        orderId: orderIdOrg1,
        transactionStatus: 'settlement',
        signatureValid: true,
        result: 'ANOMALY',
      },
    });

    // Buat campaign & donasi di Org 2 dengan WebhookEvent ANOMALY (harus diisolasi)
    const campaign2 = await prisma.campaign.create({
      data: {
        organizationId: orgId2,
        slug: 'campaign-org-lain',
        title: 'Campaign Org Lain',
        story: 'Testing isolasi tenant',
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });

    const orderIdOrg2 = 'KSB-ANOMALY-ORG2';
    await prisma.donation.create({
      data: {
        campaignId: campaign2.id,
        orderId: orderIdOrg2,
        amount: 75000n,
        status: 'FAILED',
      },
    });

    await prisma.webhookEvent.create({
      data: {
        orderId: orderIdOrg2,
        transactionStatus: 'settlement',
        signatureValid: true,
        result: 'ANOMALY',
      },
    });

    // Panggil GET dengan cookie Admin Org 1
    const req = new Request('http://localhost:3000/api/admin/anomalies', {
      method: 'GET',
      headers: {
        Cookie: `kasbuka_session=${sessionRawToken}`,
      },
    });

    const res = await GET(req as any, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const json = await res.json();

    // Hanya anomali milik Org 1 yang muncul (Tenant Isolation)
    expect(json.count).toBe(1);
    expect(json.anomalies.length).toBe(1);
    expect(json.anomalies[0].orderId).toBe(orderIdOrg1);
    expect(json.anomalies[0].transactionStatus).toBe('settlement');
    expect(json.anomalies[0].result).toBe('ANOMALY');
    expect(json.anomalies[0].amount).toBe('50000');
    expect(json.anomalies[0].campaignTitle).toBe('Campaign Uji Anomali');
    expect(json.anomalies[0].receivedAt).toBeDefined();
  });
});
