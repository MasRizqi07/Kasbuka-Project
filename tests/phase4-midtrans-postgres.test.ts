import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { verifyLedgerIntegrity } from '@/lib/ledger/verifier';
import {
  computeMidtransSignature,
  verifyMidtransSignature,
} from '@/lib/midtrans/signature';
import { calculateMidtransFee } from '@/lib/midtrans/fees';

// Menggunakan vi.hoisted agar testPrisma terdefinisi sebelum vi.mock
const { testPrisma, testDbUrl } = vi.hoisted(() => {
  const dbUrl = process.env.DATABASE_URL_TEST;
  if (!dbUrl) {
    throw new Error(
      'FATAL: DATABASE_URL_TEST tidak ditemukan di konfigurasi environment. ' +
      'Tes integrasi PostgreSQL wajib menunjuk ke kasbuka_test dan gagal keras tanpa skip.'
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('@prisma/client');
  return {
    testDbUrl: dbUrl,
    testPrisma: new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    }),
  };
});

// Pastikan prisma global mengarah ke kasbuka_test
vi.mock('@/lib/prisma', () => ({
  prisma: testPrisma,
}));

import { POST as handleMidtransWebhook } from '@/app/api/webhooks/midtrans/route';
import { POST as handleCreateDonation } from '@/app/api/campaigns/[slug]/donations/route';
import { GET as handleGetDonationStatus } from '@/app/api/donations/[orderId]/status/route';
import { LedgerService } from '@/lib/ledger/service';
import { checkRateLimit } from '@/lib/rate-limit';

describe('Postgres Live Integration Test (kasbuka_test): Fase 4 Midtrans & Webhook Idempoten', () => {
  const TEST_SERVER_KEY = 'SB-Mid-server-test-secret-key-fase4';
  let testCampaignId: string;
  let testCampaignSlug: string;

  beforeAll(async () => {
    process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;
    process.env.MIDTRANS_MOCK = 'true';

    try {
      await testPrisma.$executeRawUnsafe('SELECT 1');
    } catch (err: unknown) {
      throw new Error(`FATAL: Database kasbuka_test tidak dapat diakses pada ${testDbUrl}: ${(err as Error).message}`);
    }

    // Pastikan trigger append-only aktif
    await testPrisma.$executeRawUnsafe(
      'ALTER TABLE "LedgerEntry" ENABLE TRIGGER trg_ledger_entry_append_only;'
    );
  });

  beforeEach(async () => {
    // Bersihkan data antar tes
    await testPrisma.$executeRawUnsafe(
      'TRUNCATE TABLE "LedgerEntry", "Donation", "Campaign", "Session", "User", "Organization", "WebhookEvent", "RateLimit" CASCADE;'
    );

    const org = await testPrisma.organization.create({
      data: { name: 'Yayasan Peduli Umat' },
    });

    testCampaignSlug = `peduli-fase4-${Date.now()}`;
    const camp = await testPrisma.campaign.create({
      data: {
        organizationId: org.id,
        slug: testCampaignSlug,
        title: 'Renovasi Masjid Komunitas',
        story: 'Penggalangan dana untuk renovasi atap masjid.',
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });
    testCampaignId = camp.id;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  // UJI 1: Vektor Independen Signature SHA-512 (Gate G4)
  it('Uji 1: Verifikasi signature dengan vektor independen yang dihitung di luar fungsi', () => {
    // Hash independen dihitung langsung via Node CLI:
    // node -e "console.log(require('crypto').createHash('sha512').update('KSB-INDEP-TEST-00120050000.00SB-Mid-server-secret-999').digest('hex'))"
    const independentVector = '7bc6e6883f49a90695176efc0563de81cf773b7d4406d749c72f14ca247a444c3084eb8b51f996e59622c9c345c9cb106dd410f6edb51bd3b09b794a109d2d0b';

    const isValid = verifyMidtransSignature({
      orderId: 'KSB-INDEP-TEST-001',
      statusCode: '200',
      grossAmount: '50000.00',
      serverKey: 'SB-Mid-server-secret-999',
      incomingSignature: independentVector,
    });

    expect(isValid).toBe(true);
  });

  // UJI 2: Signature palsu -> 401 tanpa entri ledger
  it('Uji 2: Webhook dengan signature palsu ditolak 401 dan tidak mengubah ledger', async () => {
    const orderId = `KSB-FAKE-SIG-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 50000n,
        status: 'PENDING',
      },
    });

    const fakePayload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '50000.00',
      signature_key: '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      transaction_status: 'settlement',
      payment_type: 'qris',
    };

    const req = new Request('http://localhost:3000/api/webhooks/midtrans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakePayload),
    });

    const res = await handleMidtransWebhook(req);
    expect(res.status).toBe(401);

    // Ledger tidak boleh berubah
    const entriesCount = await testPrisma.ledgerEntry.count({
      where: { campaignId: testCampaignId },
    });
    expect(entriesCount).toBe(0);

    // Donasi tetap PENDING
    const don = await testPrisma.donation.findUnique({ where: { orderId } });
    expect(don?.status).toBe('PENDING');

    // WebhookEvent mencatat REJECTED dan signatureValid = false
    const events = await testPrisma.webhookEvent.findMany({ where: { orderId } });
    expect(events.length).toBe(1);
    expect(events[0].signatureValid).toBe(false);
    expect(events[0].result).toBe('REJECTED');
  });

  // UJI 3: Nominal beda -> 400 tanpa entri ledger
  it('Uji 3: Webhook dengan nominal tidak cocok ditolak 400 tanpa entri ledger', async () => {
    const orderId = `KSB-MISMATCH-AMT-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 50000n,
        status: 'PENDING',
      },
    });

    // Notifikasi menyatakan bayar 60.000 padahal di DB 50.000
    const statusCode = '200';
    const fakeGrossAmount = '60000.00';
    const validSigForFakeAmt = computeMidtransSignature(
      orderId,
      statusCode,
      fakeGrossAmount,
      TEST_SERVER_KEY
    );

    const payload = {
      order_id: orderId,
      status_code: statusCode,
      gross_amount: fakeGrossAmount,
      signature_key: validSigForFakeAmt,
      transaction_status: 'settlement',
      payment_type: 'qris',
    };

    const req = new Request('http://localhost:3000/api/webhooks/midtrans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleMidtransWebhook(req);
    expect(res.status).toBe(400);

    const entriesCount = await testPrisma.ledgerEntry.count();
    expect(entriesCount).toBe(0);

    const don = await testPrisma.donation.findUnique({ where: { orderId } });
    expect(don?.status).toBe('PENDING');

    const event = await testPrisma.webhookEvent.findFirst({ where: { orderId } });
    expect(event?.result).toBe('REJECTED');
  });

  // UJI 4: gross_amount dengan desimal tidak nol -> ditolak 400
  it('Uji 4: gross_amount dengan desimal tidak nol (misal 50000.50) ditolak 400', async () => {
    const orderId = `KSB-DECIMAL-TEST-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 50000n,
        status: 'PENDING',
      },
    });

    const grossAmount = '50000.50';
    const sig = computeMidtransSignature(orderId, '200', grossAmount, TEST_SERVER_KEY);

    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: grossAmount,
      signature_key: sig,
      transaction_status: 'settlement',
      payment_type: 'qris',
    };

    const req = new Request('http://localhost:3000/api/webhooks/midtrans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleMidtransWebhook(req);
    expect(res.status).toBe(400);

    const entriesCount = await testPrisma.ledgerEntry.count();
    expect(entriesCount).toBe(0);
  });

  // UJI 5: Status pending -> tanpa entri, dicatat IGNORED
  it('Uji 5: Notifikasi status pending tidak membuat entri dan dicatat IGNORED', async () => {
    const orderId = `KSB-PENDING-TEST-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 50000n,
        status: 'PENDING',
      },
    });

    const sig = computeMidtransSignature(orderId, '201', '50000.00', TEST_SERVER_KEY);

    const payload = {
      order_id: orderId,
      status_code: '201',
      gross_amount: '50000.00',
      signature_key: sig,
      transaction_status: 'pending',
      payment_type: 'bank_transfer',
    };

    const req = new Request('http://localhost:3000/api/webhooks/midtrans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleMidtransWebhook(req);
    expect(res.status).toBe(200);

    const entriesCount = await testPrisma.ledgerEntry.count();
    expect(entriesCount).toBe(0);

    const don = await testPrisma.donation.findUnique({ where: { orderId } });
    expect(don?.status).toBe('PENDING');

    const event = await testPrisma.webhookEvent.findFirst({ where: { orderId } });
    expect(event?.result).toBe('IGNORED');
  });

  // UJI 6: Status expire -> donasi EXPIRED tanpa entri ledger
  it('Uji 6: Notifikasi status expire mengubah donasi ke EXPIRED tanpa entri ledger', async () => {
    const orderId = `KSB-EXPIRE-TEST-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 25000n,
        status: 'PENDING',
      },
    });

    const sig = computeMidtransSignature(orderId, '200', '25000.00', TEST_SERVER_KEY);

    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '25000.00',
      signature_key: sig,
      transaction_status: 'expire',
      payment_type: 'qris',
    };

    const req = new Request('http://localhost:3000/api/webhooks/midtrans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleMidtransWebhook(req);
    expect(res.status).toBe(200);

    const don = await testPrisma.donation.findUnique({ where: { orderId } });
    expect(don?.status).toBe('EXPIRED');

    const entriesCount = await testPrisma.ledgerEntry.count();
    expect(entriesCount).toBe(0);
  });

  // UJI 7: Webhook sama dikirim 10 kali paralel -> tepat 1 entri ledger & 1 baris donasi PAID (Gate G4)
  it('Uji 7 (Gate G4 Inti): Webhook sama dikirim 10 kali paralel menghasilkan tepat 1 entri ledger dan rantai hash VALID', async () => {
    const orderId = `KSB-CONCURRENT-WEBHOOK-${Date.now()}`;
    const amount = 100000n;

    const donation = await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount,
        donorName: 'Ibu Ratna',
        isAnonymous: false,
        message: 'Bismillah berkah',
        status: 'PENDING',
      },
    });

    const sig = computeMidtransSignature(orderId, '200', '100000.00', TEST_SERVER_KEY);
    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '100000.00',
      signature_key: sig,
      transaction_status: 'settlement',
      payment_type: 'qris',
      settlement_time: new Date().toISOString(),
    };

    // Kirim 10 webhook secara bersamaan
    const requests = Array.from({ length: 10 }).map(() =>
      handleMidtransWebhook(
        new Request('http://localhost:3000/api/webhooks/midtrans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      )
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status);
    expect(statuses.every((s) => s === 200)).toBe(true);

    const jsonBodies = await Promise.all(responses.map((r) => r.json()));
    const processedCount = jsonBodies.filter((b) => b.result === 'PROCESSED').length;
    const duplicateCount = jsonBodies.filter((b) => b.result === 'DUPLICATE').length;

    expect(processedCount).toBe(1);
    expect(duplicateCount).toBe(9);

    // Verifikasi Database: Tepat 1 baris donasi PAID
    const updatedDonation = await testPrisma.donation.findUnique({
      where: { orderId },
    });
    expect(updatedDonation?.status).toBe('PAID');
    expect(updatedDonation?.paymentType).toBe('qris');

    // Verifikasi Database: Tepat 1 entri LedgerEntry
    const entries = await testPrisma.ledgerEntry.findMany({
      where: { campaignId: testCampaignId },
    });
    expect(entries.length).toBe(1);
    const entry = entries[0];
    expect(entry.seq).toBe(1);
    expect(entry.type).toBe('IN');
    expect(entry.source).toBe('MIDTRANS');
    expect(entry.amount).toBe(100000n);
    // Fee QRIS 0.7% dari 100.000 = 700
    expect(entry.fee).toBe(700n);
    expect(entry.feeSource).toBe('ESTIMATED');
    expect(entry.donationId).toBe(donation.id);
    expect(entry.donorName).toBe('Ibu Ratna');

    // Verifikasi Keutuhan Rantai Hash Ledger = VALID
    const verification = verifyLedgerIntegrity(
      entries.map((e: {
        id: string;
        campaignId: string;
        seq: number;
        type: 'IN' | 'OUT' | 'REVERSAL';
        source: 'MIDTRANS' | 'MANUAL';
        amount: bigint;
        fee: bigint;
        feeSource: string | null;
        paymentType: string | null;
        donationId: string | null;
        occurredAt: Date;
        donorName: string | null;
        isAnonymous: boolean;
        message: string | null;
        description: string | null;
        proofUrl: string | null;
        proofSha256: string | null;
        reversesEntryId: string | null;
        prevHash: string;
        hash: string;
      }) => ({
        id: e.id,
        campaignId: e.campaignId,
        seq: e.seq,
        type: e.type,
        source: e.source,
        amount: e.amount,
        fee: e.fee,
        feeSource: e.feeSource,
        paymentType: e.paymentType,
        donationId: e.donationId,
        occurredAt: e.occurredAt.toISOString(),
        donorName: e.donorName,
        isAnonymous: e.isAnonymous,
        message: e.message,
        description: e.description,
        proofUrl: e.proofUrl,
        proofSha256: e.proofSha256,
        reversesEntryId: e.reversesEntryId,
        prevHash: e.prevHash,
        hash: e.hash,
      }))
    );
    expect(verification.isValid).toBe(true);
    expect(verification.corruptEntrySeq).toBeUndefined();

    // Verifikasi WebhookEvent: 1 PROCESSED + 9 DUPLICATE
    const events = await testPrisma.webhookEvent.findMany({ where: { orderId } });
    expect(events.length).toBe(10);
    expect(events.filter((e: { result: string }) => e.result === 'PROCESSED').length).toBe(1);
    expect(events.filter((e: { result: string }) => e.result === 'DUPLICATE').length).toBe(9);
  });

  // UJI 8: appendEntry dipaksa gagal -> donasi tetap PENDING & balas 500
  it('Uji 8: Jika appendEntry dipaksa gagal, transaksi di-rollback, donasi tetap PENDING, balas 500', async () => {
    const orderId = `KSB-ROLLBACK-TEST-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 50000n,
        status: 'PENDING',
      },
    });

    const sig = computeMidtransSignature(orderId, '200', '50000.00', TEST_SERVER_KEY);
    const payload = {
      order_id: orderId,
      status_code: '200',
      gross_amount: '50000.00',
      signature_key: sig,
      transaction_status: 'settlement',
      payment_type: 'qris',
    };

    // Paksa appendEntry melempar error
    const spyAppend = vi.spyOn(LedgerService, 'appendEntry').mockRejectedValueOnce(
      new Error('Simulasi kegagalan ledger internal')
    );

    const req = new Request('http://localhost:3000/api/webhooks/midtrans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await handleMidtransWebhook(req);
    expect(res.status).toBe(500);

    // Donasi harus tetap PENDING karena rollback atomik
    const don = await testPrisma.donation.findUnique({ where: { orderId } });
    expect(don?.status).toBe('PENDING');

    // Ledger tidak boleh menyimpan entri apa pun
    const entriesCount = await testPrisma.ledgerEntry.count({
      where: { campaignId: testCampaignId },
    });
    expect(entriesCount).toBe(0);

    spyAppend.mockRestore();
  });

  // UJI 9: Endpoint POST /api/campaigns/[slug]/donations
  it('Uji 9: Endpoint pembuatan donasi publik memvalidasi nominal dan status campaign', async () => {
    // 9a. Nominal di bawah 10.000 -> 400
    const reqUnder = new Request(`http://localhost:3000/api/campaigns/${testCampaignSlug}/donations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 5000 }),
    });
    const resUnder = await handleCreateDonation(reqUnder, {
      params: Promise.resolve({ slug: testCampaignSlug }),
    });
    expect(resUnder.status).toBe(400);

    // 9b. Nominal di atas 100.000.000 -> 400
    const reqOver = new Request(`http://localhost:3000/api/campaigns/${testCampaignSlug}/donations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 150_000_000 }),
    });
    const resOver = await handleCreateDonation(reqOver, {
      params: Promise.resolve({ slug: testCampaignSlug }),
    });
    expect(resOver.status).toBe(400);

    // 9c. Sukses dengan Campaign ACTIVE -> 201 dengan token & orderId
    const reqValid = new Request(`http://localhost:3000/api/campaigns/${testCampaignSlug}/donations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 25000,
        donorName: 'Hamba Allah',
        isAnonymous: true,
        doa: 'Semoga berkah selalu',
      }),
    });
    const resValid = await handleCreateDonation(reqValid, {
      params: Promise.resolve({ slug: testCampaignSlug }),
    });
    expect(resValid.status).toBe(201);
    const jsonValid = await resValid.json();
    expect(jsonValid.token).toBeDefined();
    expect(jsonValid.orderId).toMatch(/^KSB-[a-f0-9]{32}$/);

    const savedDonation = await testPrisma.donation.findUnique({
      where: { orderId: jsonValid.orderId },
    });
    expect(savedDonation?.status).toBe('PENDING');
    expect(savedDonation?.amount).toBe(25000n);
    expect(savedDonation?.isAnonymous).toBe(true);

    // 9d. Campaign CLOSED -> 409 Conflict
    await testPrisma.campaign.update({
      where: { id: testCampaignId },
      data: { status: 'CLOSED' },
    });
    const reqClosed = new Request(`http://localhost:3000/api/campaigns/${testCampaignSlug}/donations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 25000 }),
    });
    const resClosed = await handleCreateDonation(reqClosed, {
      params: Promise.resolve({ slug: testCampaignSlug }),
    });
    expect(resClosed.status).toBe(409);
  });

  // UJI 10: Endpoint GET /api/donations/[orderId]/status
  it('Uji 10: Endpoint polling status donasi publik hanya mengembalikan orderId dan status tanpa mengekspos data pribadi donatur', async () => {
    const orderId = `KSB-STATUS-TEST-${Date.now()}`;
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId,
        amount: 50000n,
        donorName: 'Nama Rahasia',
        isAnonymous: true,
        message: 'Doa Pribadi',
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    const req = new Request(`http://localhost:3000/api/donations/${orderId}/status`);
    const res = await handleGetDonationStatus(req, {
      params: Promise.resolve({ orderId }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orderId).toBe(orderId);
    expect(json.status).toBe('PAID');
    expect(json.paidAt).toBeDefined();

    // Pastikan tidak ada data donorName atau message di respons
    expect(json.donorName).toBeUndefined();
    expect(json.message).toBeUndefined();
    expect(json.isAnonymous).toBeUndefined();
  });

  // UJI 11: Unit Test Tabel Tarif Biaya Midtrans (D3 & Bagian 4.4)
  it('Uji 11: Tabel tarif biaya Midtrans menghitung estimasi berlabel dan menandai UNKNOWN jika tidak ada di tabel', () => {
    // QRIS 0.7% dari 100.000 = 700
    const qrisFee = calculateMidtransFee('qris', 100000n);
    expect(qrisFee.fee).toBe(700n);
    expect(qrisFee.feeSource).toBe('ESTIMATED');

    // Bank Transfer Flat Rp 4.000
    const vaFee = calculateMidtransFee('bank_transfer', 100000n);
    expect(vaFee.fee).toBe(4000n);
    expect(vaFee.feeSource).toBe('ESTIMATED');

    // BCA VA Flat Rp 4.000
    const bcaFee = calculateMidtransFee('bca_va', 50000n);
    expect(bcaFee.fee).toBe(4000n);
    expect(bcaFee.feeSource).toBe('ESTIMATED');

    // Unknown payment_type -> fee = 0, feeSource = UNKNOWN
    const unknownFee = calculateMidtransFee('metode_asing_xyz', 100000n);
    expect(unknownFee.fee).toBe(0n);
    expect(unknownFee.feeSource).toBe('UNKNOWN');

    // null / undefined -> fee = 0, UNKNOWN
    const nullFee = calculateMidtransFee(null, 100000n);
    expect(nullFee.fee).toBe(0n);
    expect(nullFee.feeSource).toBe('UNKNOWN');
  });

  // UJI 12: Rate Limiting Atomik PostgreSQL
  it('Uji 12: Rate limiter atomik Postgres membatasi request saat limit terlampaui', async () => {
    const rateLimitKey = `test-ip-${Date.now()}`;
    const limit = 3;
    const windowMs = 5000;

    const r1 = await checkRateLimit({ key: rateLimitKey, limit, windowMs }, testPrisma);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimit({ key: rateLimitKey, limit, windowMs }, testPrisma);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkRateLimit({ key: rateLimitKey, limit, windowMs }, testPrisma);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);

    // Request ke-4 harus diblokir (success: false)
    const r4 = await checkRateLimit({ key: rateLimitKey, limit, windowMs }, testPrisma);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });
});
