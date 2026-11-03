import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { GENESIS_PREV_HASH } from '@/lib/ledger/hash';

// 3.6: Menggunakan vi.hoisted agar testPrisma diinisialisasi sebelum vi.mock di-hoist
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

// Pastikan LedgerService dan seluruh route mengarah secara eksklusif ke kasbuka_test
vi.mock('@/lib/prisma', () => ({
  prisma: testPrisma,
}));

import { LedgerService, isSeqCollisionError, withSeqRetry } from '@/lib/ledger/service';

describe('Postgres Live Integration Test (kasbuka_test): Hardening Lapisan Database', () => {
  let testOrgId: string;
  let testCampaignId: string;

  beforeAll(async () => {
    // 3.6: Verifikasi koneksi ke PostgreSQL kasbuka_test (gagal keras jika database tidak terjangkau)
    try {
      await testPrisma.$executeRawUnsafe('SELECT 1');
    } catch (err: unknown) {
      throw new Error(
        `FATAL: Gagal menghubungi database kasbuka_test pada ${testDbUrl}: ${(err as Error).message}`
      );
    }

    // Pastikan trigger aktif
    await testPrisma.$executeRawUnsafe(
      'ALTER TABLE "LedgerEntry" ENABLE TRIGGER trg_ledger_entry_append_only;'
    );

    // Bersihkan data lama menggunakan TRUNCATE CASCADE (karena DELETE diblokir oleh trigger append-only)
    await testPrisma.$executeRawUnsafe(
      'TRUNCATE TABLE "LedgerEntry", "Donation", "Campaign", "Session", "User", "Organization" CASCADE;'
    );

    // Buat data induk Organisasi dan Campaign langsung di kasbuka_test
    const org = await testPrisma.organization.create({
      data: {
        name: 'Takmir Al-Ikhlas Karangpoh (Live Test)',
      },
    });
    testOrgId = org.id;

    const campaign = await testPrisma.campaign.create({
      data: {
        organizationId: testOrgId,
        slug: 'renovasi-atap-musala-live-test',
        title: 'Renovasi Atap Musala Al-Ikhlas (Live DB Test)',
        story: 'Pengujian konkurensi dan append-only pada PostgreSQL asli.',
        targetAmount: 50000000n,
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    // Pastikan trigger selalu aktif setelah seluruh tes selesai
    try {
      await testPrisma.$executeRawUnsafe(
        'ALTER TABLE "LedgerEntry" ENABLE TRIGGER trg_ledger_entry_append_only;'
      );
    } catch {
      // Ignored
    }
    await testPrisma.$disconnect();
  });

  it('Uji 1 (3.5): 20 penulisan paralel dengan lock aktif, mutex proses mati (skipProcessMutex: true) -> semua 20 sukses, seq 1..20 tanpa celah, VALID', async () => {
    const PARALLEL_COUNT = 20;

    const parallelTasks = Array.from({ length: PARALLEL_COUNT }, (_, index) => {
      return LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'IN',
        source: 'MIDTRANS',
        amount: BigInt(50000 + (index + 1) * 2500),
        fee: 350n,
        donorName: `Donatur Paralel #${index + 1}`,
        description: `Donasi lock aktif #${index + 1}`,
        skipProcessMutex: true, // MUTEX PROSES MATI
        skipAdvisoryLock: false, // ADVISORY LOCK POSTGRES AKTIF
        maxRetries: 10,
      });
    });

    const results = await Promise.all(parallelTasks);

    // 1. Seluruh 20 penulisan paralel harus berhasil
    expect(results).toHaveLength(PARALLEL_COUNT);

    // 2. Query langsung ke PostgreSQL kasbuka_test via RAW SQL
    const rows = await testPrisma.$queryRaw<Array<{ seq: number; hash: string; prevHash: string; amount: bigint }>>`
      SELECT seq, hash, "prevHash", amount
      FROM "LedgerEntry"
      WHERE "campaignId" = ${testCampaignId}
      ORDER BY seq ASC;
    `;

    expect(rows).toHaveLength(PARALLEL_COUNT);

    // 3. Pastikan seq tersusun sempurna 1..20 tanpa celah dan tanpa duplikat
    const seqNumbers = rows.map((r: { seq: number }) => r.seq);
    const expectedSeqNumbers = Array.from({ length: PARALLEL_COUNT }, (_, i) => i + 1);
    expect(seqNumbers).toEqual(expectedSeqNumbers);

    // 4. Periksa kontinuitas rantai SHA-256 pada baris fisik basis data
    expect(rows[0].prevHash).toBe(GENESIS_PREV_HASH);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].prevHash).toBe(rows[i - 1].hash);
    }

    // 5. Jalankan verifikator resmi integritas hash chain
    const verification = await LedgerService.verifyCampaignLedger(testCampaignId, testPrisma);
    expect(verification.isValid).toBe(true);
    expect(verification.totalEntries).toBe(PARALLEL_COUNT);
    expect(verification.lastHash).toBe(rows[PARALLEL_COUNT - 1].hash);
  });

  it('Uji 2 (3.5): 20 penulisan paralel dengan lock DAN mutex mati -> yang sukses membentuk rantai VALID tanpa celah seq, yang gagal error terdefinisi', async () => {
    // Buat campaign baru terpisah untuk pengujian tanpa lock
    const noLockCampaign = await testPrisma.campaign.create({
      data: {
        organizationId: testOrgId,
        slug: 'uji-nolock-konkurensi-' + Date.now(),
        title: 'Uji Tanpa Lock Konkurensi',
        story: 'Menguji unique index constraint saat lock dan mutex dimatikan.',
        targetAmount: 20000000n,
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });

    const PARALLEL_COUNT = 20;

    // Mutex proses DAN advisory lock PostgreSQL dimatikan
    const tasks = Array.from({ length: PARALLEL_COUNT }, (_, index) => {
      return LedgerService.appendEntry({
        campaignId: noLockCampaign.id,
        type: 'IN',
        source: 'MANUAL',
        amount: BigInt(10000 * (index + 1)),
        description: `Entri tanpa lock #${index + 1}`,
        skipProcessMutex: true, // MUTEX PROSES MATI
        skipAdvisoryLock: true,  // LOCK DATABASE MATI (Uji murni layer DB unique constraint & retry)
        maxRetries: 3,
      }).then(
        (val) => ({ success: true, entry: val, error: null }),
        (err: unknown) => ({ success: false, entry: null, error: err as Error })
      );
    });

    const results = await Promise.all(tasks);

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Minimal harus ada entri yang berhasil masuk
    expect(successful.length).toBeGreaterThan(0);

    // Jika ada yang gagal setelah retry habis, errornya harus berupa error terdefinisi (P2002 collision), bukan crash misterius
    for (const f of failed) {
      expect(f.error).toBeDefined();
      const isCollision = isSeqCollisionError(f.error) || f.error?.message.includes('Unique constraint');
      expect(isCollision).toBe(true);
    }

    // Ambil semua entri yang berhasil tersimpan di database nyata
    const savedRows = await testPrisma.$queryRaw<Array<{ seq: number; hash: string; prevHash: string }>>`
      SELECT seq, "prevHash", hash
      FROM "LedgerEntry"
      WHERE "campaignId" = ${noLockCampaign.id}
      ORDER BY seq ASC;
    `;

    expect(savedRows.length).toBe(successful.length);

    // KETENTUAN 3.5: Yang sukses HARUS rantai VALID tanpa celah seq (1, 2, 3... N)
    const seqs = savedRows.map((r: { seq: number }) => r.seq);
    const expectedSeqs = Array.from({ length: savedRows.length }, (_, i) => i + 1);
    expect(seqs).toEqual(expectedSeqs);

    // Rantai hash pada database fisik harus utuh sempurna
    expect(savedRows[0].prevHash).toBe(GENESIS_PREV_HASH);
    for (let i = 1; i < savedRows.length; i++) {
      expect(savedRows[i].prevHash).toBe(savedRows[i - 1].hash);
    }

    const verification = await LedgerService.verifyCampaignLedger(noLockCampaign.id, testPrisma);
    expect(verification.isValid).toBe(true);
    expect(verification.totalEntries).toBe(savedRows.length);
  });

  it('Uji 3 (3.5): Jalur retry hanya menangkap benturan (campaignId, seq) — P2002 pada Donation.orderId TIDAK di-retry', async () => {
    const duplicateOrderId = 'KSB-ORDER-UNIQUE-TEST';

    // Buat donasi pertama
    await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId: duplicateOrderId,
        amount: 50000n,
        status: 'PENDING',
      },
    });

    // Buat donasi kedua dengan orderId yang sama persis
    let p2002Error: unknown = null;
    try {
      await testPrisma.donation.create({
        data: {
          campaignId: testCampaignId,
          orderId: duplicateOrderId,
          amount: 75000n,
          status: 'PENDING',
        },
      });
    } catch (err: unknown) {
      p2002Error = err;
    }

    expect(p2002Error).toBeDefined();
    // P2002 pada Donation.orderId HARUS ditolak oleh isSeqCollisionError (tidak boleh di-retry)
    expect(isSeqCollisionError(p2002Error)).toBe(false);
  });

  it('Uji 4 (3.3): Trigger append-only di Postgres nyata — UPDATE & DELETE LedgerEntry ditolak, UPDATE Donation diizinkan', async () => {
    // 1. UPDATE pada LedgerEntry wajib digagalkan oleh trigger database
    let updateError: Error | null = null;
    try {
      await testPrisma.$executeRawUnsafe('UPDATE "LedgerEntry" SET amount = amount + 1 WHERE seq = 1;');
    } catch (err: unknown) {
      updateError = err as Error;
    }

    expect(updateError).toBeDefined();
    expect(updateError?.message).toContain('LedgerEntry append-only');

    // 2. DELETE pada LedgerEntry wajib digagalkan oleh trigger database
    let deleteError: Error | null = null;
    try {
      await testPrisma.$executeRawUnsafe('DELETE FROM "LedgerEntry" WHERE seq = 1;');
    } catch (err: unknown) {
      deleteError = err as Error;
    }

    expect(deleteError).toBeDefined();
    expect(deleteError?.message).toContain('LedgerEntry append-only');

    // 3. Tabel Donation BOLEH di-update (status PENDING -> PAID)
    const testDonation = await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId: 'KSB-DONATION-UPDATE-' + Date.now(),
        amount: 25000n,
        status: 'PENDING',
      },
    });

    const updated = await testPrisma.donation.update({
      where: { id: testDonation.id },
      data: { status: 'PAID' },
    });

    expect(updated.status).toBe('PAID');
  });

  it('Uji 5: Proteksi saldo pengeluaran (OUT) ganda anti double-spend pada PostgreSQL nyata', async () => {
    const expenseCamp = await testPrisma.campaign.create({
      data: {
        organizationId: testOrgId,
        slug: 'uji-saldo-anti-double-spend-' + Date.now(),
        title: 'Uji Saldo Anti Double Spend',
        story: 'Menguji atomisitas validasi saldo pengeluaran.',
        targetAmount: 10000000n,
        basis: 'TERBATAS',
        status: 'ACTIVE',
      },
    });

    // 1. Setor kas awal Rp 1.000.000
    await LedgerService.appendEntry({
      campaignId: expenseCamp.id,
      type: 'IN',
      source: 'MANUAL',
      amount: 1000000n,
      description: 'Kas awal pembukaan campaign',
      skipProcessMutex: true,
    });

    // 2. Luncurkan 5 permintaan pengeluaran serentak @ Rp 400.000 (total Rp 2.000.000)
    // Hanya tepat 2 yang boleh berhasil (2 x 400.000 = 800.000 <= 1.000.000)
    const expenseTasks = Array.from({ length: 5 }, (_, i) => {
      return LedgerService.appendEntry({
        campaignId: expenseCamp.id,
        type: 'OUT',
        source: 'MANUAL',
        amount: 400000n,
        description: `Pengeluaran live #${i + 1}`,
        proofUrl: `/uploads/proofs/nota-live-${i + 1}.jpg`,
        proofSha256: `sha256-live-proof-${i + 1}`,
        skipProcessMutex: true,
      }).then(
        (val) => ({ success: true, val }),
        (err) => ({ success: false, error: err.message })
      );
    });

    const expenseResults = await Promise.all(expenseTasks);

    const successful = expenseResults.filter((r) => r.success);
    const failed = expenseResults.filter((r) => !r.success);

    expect(successful.length).toBe(2);
    expect(failed.length).toBe(3);

    const balance = await LedgerService.getCampaignBalance(expenseCamp.id, testPrisma);
    expect(balance.saldo).toBe(200000n);

    const integrity = await LedgerService.verifyCampaignLedger(expenseCamp.id, testPrisma);
    expect(integrity.isValid).toBe(true);
    expect(integrity.totalEntries).toBe(3);
  });

  it('Uji 6 (3.5b A.1): Menolak pemanggilan appendEntry jika tx berupa klien Prisma global ($transaction terdeteksi)', async () => {
    await expect(
      LedgerService.appendEntry(
        {
          campaignId: testCampaignId,
          type: 'IN',
          source: 'MANUAL',
          amount: 10000n,
        },
        testPrisma as any // Klien global Prisma
      )
    ).rejects.toThrow('Parameter tx tidak boleh berupa klien Prisma global');
  });

  it('Uji 7 (3.5b A.2): Menolak skipAdvisoryLock jika NODE_ENV bernilai production', async () => {
    try {
      vi.stubEnv('NODE_ENV', 'production');
      await expect(
        LedgerService.appendEntry({
          campaignId: testCampaignId,
          type: 'IN',
          source: 'MANUAL',
          amount: 10000n,
          skipAdvisoryLock: true,
        })
      ).rejects.toThrow('skipAdvisoryLock tidak boleh aktif di production.');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('Uji 8 (3.5b B.1): Validasi nominal — amount = 0n atau negatif ditolak', async () => {
    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'IN',
        source: 'MANUAL',
        amount: 0n,
      })
    ).rejects.toThrow('Nominal entri ledger harus lebih besar dari 0.');

    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'IN',
        source: 'MANUAL',
        amount: -5000n,
      })
    ).rejects.toThrow('Nominal entri ledger harus lebih besar dari 0.');
  });

  it('Uji 9 (3.5b B.2): Validasi fee — negatif ditolak, fee > amount pada IN ditolak, fee > 0n pada OUT/REVERSAL ditolak', async () => {
    // 1. Fee negatif ditolak
    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'IN',
        source: 'MANUAL',
        amount: 10000n,
        fee: -50n,
      })
    ).rejects.toThrow('Fee tidak boleh negatif.');

    // 2. Fee > amount pada IN ditolak
    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'IN',
        source: 'MANUAL',
        amount: 10000n,
        fee: 15000n,
      })
    ).rejects.toThrow('Fee tidak boleh melebihi nominal pemasukan (amount).');

    // 3. Fee > 0n pada OUT ditolak
    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'OUT',
        source: 'MANUAL',
        amount: 10000n,
        fee: 200n,
        proofUrl: '/uploads/proofs/test.jpg',
        proofSha256: 'sha256-dummy',
      })
    ).rejects.toThrow('Fee untuk entri OUT harus 0n.');
  });

  it('Uji 10 (3.5b B.3): Validasi reversal — target bertipe REVERSAL ditolak, dan nominal reversal tidak sama dengan nominal target ditolak', async () => {
    // 1. Buat entri IN valid
    const targetIn = await LedgerService.appendEntry({
      campaignId: testCampaignId,
      type: 'IN',
      source: 'MANUAL',
      amount: 60000n,
      description: 'Entri target uji reversal B.3',
    });

    // 2. Reversal dengan nominal berbeda dari target ditolak
    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'REVERSAL',
        source: 'MANUAL',
        amount: 55000n, // Nominal tidak cocok dengan 60000n
        reversesEntryId: targetIn.id,
        description: 'Mencoba reversal dengan nominal beda',
      })
    ).rejects.toThrow('Nominal reversal (Rp 55000) harus sama persis dengan nominal entri target (Rp 60000).');

    // 3. Reversal yang benar (nominal sama persis) berhasil
    const validRev = await LedgerService.appendEntry({
      campaignId: testCampaignId,
      type: 'REVERSAL',
      source: 'MANUAL',
      amount: 60000n,
      reversesEntryId: targetIn.id,
      description: 'Reversal sah atas targetIn',
    });

    // 4. Reversal atas entri yang bertipe REVERSAL ditolak keras
    await expect(
      LedgerService.appendEntry({
        campaignId: testCampaignId,
        type: 'REVERSAL',
        source: 'MANUAL',
        amount: 60000n,
        reversesEntryId: validRev.id,
        description: 'Reversal atas reversal (dilarang)',
      })
    ).rejects.toThrow('Entri target reversal harus bertipe IN atau OUT (ditemukan: REVERSAL).');
  });

  it('Uji 11 (3.5b C.1): Helper withSeqRetry mengulang saat P2002 sequence collision dan TIDAK mengulang pada P2002 Donation.orderId', async () => {
    let seqAttempts = 0;
    const retryResult = await withSeqRetry(async () => {
      seqAttempts++;
      if (seqAttempts === 1) {
        const err = new Error('Unique constraint failed on the fields: (`campaignId`,`seq`)');
        (err as unknown as { code: string; meta: unknown }).code = 'P2002';
        (err as unknown as { meta: unknown }).meta = { modelName: 'LedgerEntry', target: ['campaignId', 'seq'] };
        throw err;
      }
      return 'RETRY_SUCCEEDED';
    });

    expect(retryResult).toBe('RETRY_SUCCEEDED');
    expect(seqAttempts).toBe(2);

    let donationAttempts = 0;
    await expect(
      withSeqRetry(async () => {
        donationAttempts++;
        const err = new Error('Unique constraint failed on the fields: (`orderId`)');
        (err as unknown as { code: string; meta: unknown }).code = 'P2002';
        (err as unknown as { meta: unknown }).meta = { modelName: 'Donation', target: ['orderId'] };
        throw err;
      })
    ).rejects.toThrow('orderId');

    expect(donationAttempts).toBe(1); // Gagal keras tanpa retry
  });

  it('Uji 12 (3.5b D.1): Kolom donationId, paymentType, feeSource tersimpan & modifikasi langsung pada donationId membuat verifikasi integritas RUSAK', async () => {
    // 1. Buat donasi baru di kasbuka_test
    const don = await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId: 'KSB-PAYLOAD-HASH-' + Date.now(),
        amount: 15000n,
        status: 'PAID',
        paymentType: 'qris',
      },
    });

    // 2. Catat entri ledger dengan donationId, paymentType, feeSource
    const entry = await LedgerService.appendEntry({
      campaignId: testCampaignId,
      type: 'IN',
      source: 'MIDTRANS',
      amount: 15000n,
      fee: 105n,
      feeSource: 'ESTIMATED',
      paymentType: 'qris',
      donationId: don.id,
      donorName: 'Donatur QRIS Berlabel',
      description: 'Donasi Midtrans dengan feeSource ESTIMATED',
    });

    expect(entry.donationId).toBe(don.id);
    expect(entry.paymentType).toBe('qris');
    expect(entry.feeSource).toBe('ESTIMATED');

    // 3. Verifikasi awal harus VALID
    let check = await LedgerService.verifyCampaignLedger(testCampaignId, testPrisma);
    expect(check.isValid).toBe(true);

    // 4. Tamper test: Buat donasi kedua yang valid, lalu ubah donationId ke donasi kedua langsung di DB
    const donTamper = await testPrisma.donation.create({
      data: {
        campaignId: testCampaignId,
        orderId: 'KSB-TAMPER-TARGET-' + Date.now(),
        amount: 25000n,
        status: 'PAID',
      },
    });

    try {
      await testPrisma.$executeRawUnsafe('ALTER TABLE "LedgerEntry" DISABLE TRIGGER trg_ledger_entry_append_only;');
      await testPrisma.$executeRawUnsafe(
        'UPDATE "LedgerEntry" SET "donationId" = $1 WHERE id = $2;',
        donTamper.id,
        entry.id
      );
    } finally {
      await testPrisma.$executeRawUnsafe('ALTER TABLE "LedgerEntry" ENABLE TRIGGER trg_ledger_entry_append_only;');
    }

    // 5. Verifikasi ulang HARUS mendeteksi manipulasi data fisik dan melaporkan RUSAK
    check = await LedgerService.verifyCampaignLedger(testCampaignId, testPrisma);
    expect(check.isValid).toBe(false);
    expect(check.corruptEntrySeq).toBe(entry.seq);
  });
});
