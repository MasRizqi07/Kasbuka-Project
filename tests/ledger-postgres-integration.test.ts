import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma as realPrisma } from '@/lib/prisma';
import { LedgerService } from '@/lib/ledger/service';
import { verifyLedgerIntegrity } from '@/lib/ledger/verifier';
import { GENESIS_PREV_HASH } from '@/lib/ledger/hash';

describe('Postgres Live Integration Test: Pembuktian Konkurensi & Rantai Hash pada Database Nyata', () => {
  let testOrgId: string;
  let testCampaignId: string;

  beforeAll(async () => {
    // Bersihkan data lama jika ada
    await realPrisma.ledgerEntry.deleteMany({});
    await realPrisma.donation.deleteMany({});
    await realPrisma.campaign.deleteMany({});
    await realPrisma.session.deleteMany({});
    await realPrisma.user.deleteMany({});
    await realPrisma.organization.deleteMany({});

    // Buat data induk Organisasi dan Campaign langsung di database nyata
    const org = await realPrisma.organization.create({
      data: {
        name: 'Takmir Al-Ikhlas Karangpoh',
      },
    });
    testOrgId = org.id;

    const campaign = await realPrisma.campaign.create({
      data: {
        organizationId: testOrgId,
        slug: 'renovasi-atap-musala-live-test',
        title: 'Renovasi Atap Musala Al-Ikhlas (Live DB Test)',
        story: 'Pengujian integritas ledger pada PostgreSQL asli.',
        targetAmount: 50000000n,
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    await realPrisma.$disconnect();
  });

  it('Uji 1: 20 penulisan paralel dengan mutex aplikasi MATI TOTAL (skipProcessMutex: true) pada PostgreSQL nyata', async () => {
    const PARALLEL_COUNT = 20;

    // Luncurkan 20 penulisan paralel secara serentak ke database PostgreSQL nyata
    // Mutex aplikasi dimatikan total (skipProcessMutex: true) untuk memaksa transaksi
    // bertarung di level PostgreSQL (advisory lock + unique index P2002 retry).
    const parallelTasks = Array.from({ length: PARALLEL_COUNT }, (_, index) => {
      return LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'IN',
        source: 'MIDTRANS',
        amount: BigInt(50000 + (index + 1) * 2500),
        fee: 350n,
        donorName: `Hamba Allah #${index + 1}`,
        description: `Donasi live concurrent test #${index + 1}`,
        skipProcessMutex: true, // MUTEX APLIKASI DIMATIKAN
        maxRetries: 10,
      });
    });

    const results = await Promise.all(parallelTasks);

    // 1. Seluruh 20 penulisan paralel harus berhasil
    expect(results).toHaveLength(PARALLEL_COUNT);

    // 2. Query langsung ke PostgreSQL via RAW SQL
    const rows = await realPrisma.$queryRaw<Array<{ seq: number; hash: string; prevHash: string; amount: bigint }>>`
      SELECT seq, hash, "prevHash", amount
      FROM "LedgerEntry"
      WHERE "campaignId" = ${testCampaignId}
      ORDER BY seq ASC;
    `;

    expect(rows).toHaveLength(PARALLEL_COUNT);

    // 3. Pastikan seq tersusun sempurna 1..20 tanpa celah dan tanpa duplikat
    const seqNumbers = rows.map((r) => r.seq);
    const expectedSeqNumbers = Array.from({ length: PARALLEL_COUNT }, (_, i) => i + 1);
    expect(seqNumbers).toEqual(expectedSeqNumbers);

    // 4. Periksa kontinuitas rantai SHA-256 pada baris fisik basis data
    expect(rows[0].prevHash).toBe(GENESIS_PREV_HASH);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].hash);
    }

    // 5. Jalankan verifikator resmi integritas hash chain
    const fullEntries = await realPrisma.ledgerEntry.findMany({
      where: { campaignId: testCampaignId },
      orderBy: { seq: 'asc' },
    });

    const verification = verifyLedgerIntegrity(
      fullEntries.map((e) => ({
        id: e.id,
        campaignId: e.campaignId,
        seq: e.seq,
        type: e.type,
        source: e.source,
        amount: e.amount,
        fee: e.fee,
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
    expect(verification.totalEntries).toBe(PARALLEL_COUNT);
    expect(verification.lastHash).toBe(rows[PARALLEL_COUNT - 1].hash);
  });

  it('Uji 2: Proteksi double-spend konkurensi pengeluaran (OUT) pada PostgreSQL nyata tanpa mutex aplikasi', async () => {
    // 1. Buat campaign baru khusus untuk tes saldo
    const expenseCamp = await realPrisma.campaign.create({
      data: {
        organizationId: testOrgId,
        slug: 'uji-saldo-anti-double-spend',
        title: 'Uji Saldo Anti Double Spend',
        story: 'Menguji atomisitas validasi saldo pengeluaran.',
        targetAmount: 10000000n,
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });

    // 2. Setor kas awal Rp 1.000.000
    await LedgerService.appendEntry({
      campaignId: expenseCamp.id,
      type: 'IN',
      source: 'MANUAL',
      amount: 1000000n,
      description: 'Kas awal pembukaan campaign',
      skipProcessMutex: true,
    });

    // 3. Luncurkan 5 permintaan pengeluaran serentak @ Rp 400.000 (total Rp 2.000.000)
    // Mutex aplikasi DIMATIKAN TOTAL (skipProcessMutex: true)
    // PostgreSQL advisory lock dan transaksi atomik harus memastikan hanya tepat 2 yang berhasil!
    const expenseTasks = Array.from({ length: 5 }, (_, i) => {
      return LedgerService.appendEntry({
        campaignId: expenseCamp.id,
        type: 'OUT',
        source: 'MANUAL',
        amount: 400000n,
        description: `Pengeluaran live #${i + 1}`,
        proofUrl: `/uploads/proofs/nota-live-${i + 1}.jpg`,
        proofSha256: `sha256-live-proof-${i + 1}`,
        skipProcessMutex: true, // MUTEX APLIKASI DIMATIKAN
      }).then(
        (val) => ({ success: true, val }),
        (err) => ({ success: false, error: err.message })
      );
    });

    const expenseResults = await Promise.all(expenseTasks);

    const successful = expenseResults.filter((r) => r.success);
    const failed = expenseResults.filter((r) => !r.success);

    // Tepat 2 pengeluaran berhasil (2 x 400.000 = 800.000 <= 1.000.000)
    // 3 pengeluaran lainnya ditolak karena melebihi saldo tersedia
    expect(successful.length).toBe(2);
    expect(failed.length).toBe(3);

    // Saldo akhir di PostgreSQL tepat Rp 200.000 (tidak pernah overdraft / negatif)
    const balance = await LedgerService.getCampaignBalance(expenseCamp.id);
    expect(balance.saldo).toBe(200000n);

    // Verifikasi keutuhan ledger pada campaign ini
    const integrity = await LedgerService.verifyCampaignLedger(expenseCamp.id);
    expect(integrity.isValid).toBe(true);
    expect(integrity.totalEntries).toBe(3); // 1 kas awal + 2 pengeluaran sah
  });
});
