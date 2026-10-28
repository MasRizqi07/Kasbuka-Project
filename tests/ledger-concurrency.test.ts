import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LedgerService } from '@/lib/ledger/service';
import { verifyLedgerIntegrity } from '@/lib/ledger/verifier';
import { GENESIS_PREV_HASH } from '@/lib/ledger/hash';
import { prisma } from '@/lib/prisma';

// Mock in-memory transactional database simulating ACID guarantees
vi.mock('@/lib/prisma', () => {
  interface MockEntry {
    id: string;
    campaignId: string;
    seq: number;
    type: string;
    source: string;
    amount: bigint;
    fee: bigint;
    occurredAt: Date;
    donorName?: string | null;
    isAnonymous: boolean;
    message?: string | null;
    description?: string | null;
    proofUrl?: string | null;
    proofSha256?: string | null;
    reversesEntryId?: string | null;
    createdById?: string | null;
    prevHash: string;
    hash: string;
    createdAt: Date;
  }

  let entries: MockEntry[] = [];

  const mockDb = {
    ledgerEntry: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        // Simulasi network / query latency 2ms untuk memicu race window
        await new Promise((res) => setTimeout(res, 2));
        const filtered = entries.filter((e) => e.campaignId === where.campaignId);
        if (orderBy?.seq === 'desc') {
          filtered.sort((a, b) => b.seq - a.seq);
        }
        return filtered[0] || null;
      }),
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        const filtered = entries.filter((e) => e.campaignId === where.campaignId);
        if (orderBy?.seq === 'desc') {
          filtered.sort((a, b) => b.seq - a.seq);
        } else {
          filtered.sort((a, b) => a.seq - b.seq);
        }
        return filtered;
      }),
      create: vi.fn(async ({ data }: { data: any }) => {
        // Enforce DB constraint @@unique([campaignId, seq])
        const existing = entries.find(
          (e) => e.campaignId === data.campaignId && e.seq === data.seq
        );
        if (existing) {
          const err = new Error(
            `Unique constraint failed on the fields: (campaignId, seq). Duplicate seq #${data.seq}.`
          );
          (err as any).code = 'P2002';
          throw err;
        }

        const newEntry: MockEntry = {
          id: `entry-${data.seq}-${Date.now()}`,
          ...data,
          createdAt: new Date(),
        };
        entries.push(newEntry);
        return newEntry;
      }),
    },
    $executeRawUnsafe: vi.fn(async () => 1),
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(mockDb);
    }),
    _reset: () => {
      entries = [];
    },
    _getEntries: () => entries,
  };

  return { prisma: mockDb };
});

describe('Fase 2 & 3 Concurrency Verification: Uji Penulisan Paralel ke Ledger', () => {
  beforeEach(() => {
    (prisma as any)._reset();
  });

  it('20 penulisan paralel ke satu campaign harus menghasilkan nomor urut seq 1..20 tanpa celah dan hash chain tetap VALID', async () => {
    const campaignId = 'camp-concurrency-test';
    const PARALLEL_COUNT = 20;

    // Trigger 20 penulisan secara bersamaan via Promise.all
    const promises = Array.from({ length: PARALLEL_COUNT }, (_, index) => {
      return LedgerService.appendEntry({
        campaignId,
        type: 'IN',
        source: 'MIDTRANS',
        amount: BigInt(50000 + index * 1000), // Nominal berbeda per entri
        fee: 350n,
        donorName: `Donatur Paralel #${index + 1}`,
        description: `Donasi paralel ${index + 1}`,
      });
    });

    const results = await Promise.all(promises);

    // 1. Semua 20 penulisan harus berhasil tanpa race condition crash
    expect(results).toHaveLength(PARALLEL_COUNT);

    // 2. Ambil entri yang tersimpan di database
    const savedEntries = (prisma as any)._getEntries();
    expect(savedEntries).toHaveLength(PARALLEL_COUNT);

    // 3. Periksa nomor urut seq harus urut 1 sampai 20 tanpa celah dan tanpa duplikat
    const seqs = savedEntries.map((e: any) => e.seq).sort((a: number, b: number) => a - b);
    const expectedSeqs = Array.from({ length: PARALLEL_COUNT }, (_, i) => i + 1);
    expect(seqs).toEqual(expectedSeqs);

    // 4. Periksa kontinuitas rantai hash (prevHash[i] === hash[i - 1])
    const sorted = [...savedEntries].sort((a: any, b: any) => a.seq - b.seq);
    expect(sorted[0].prevHash).toBe(GENESIS_PREV_HASH);

    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].prevHash).toBe(sorted[i - 1].hash);
    }

    // 5. Jalankan verifikator resmi: keutuhan hash chain harus VALID
    const verification = verifyLedgerIntegrity(
      sorted.map((e: any) => ({
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
    expect(verification.lastHash).toBe(sorted[PARALLEL_COUNT - 1].hash);
  });

  it('pencegahan double-spend: penulisan pengeluaran konkuren melebihi saldo kas harus ditolak dan tidak overdraft', async () => {
    const campaignId = 'camp-double-spend-test';

    // 1. Kas awal Rp 1.000.000
    await LedgerService.appendEntry({
      campaignId,
      type: 'IN',
      source: 'MANUAL',
      amount: 1000000n,
      description: 'Kas Awal',
    });

    // 2. Luncurkan 5 permintaan pengeluaran paralel sebesar Rp 400.000 secara bersamaan
    // Total yang diminta = Rp 2.000.000, padahal saldo hanya Rp 1.000.000
    // Hanya maksimal 2 yang boleh berhasil (2 x 400.000 = 800.000 <= 1.000.000)
    // Sisanya (3 permintaan) wajib ditolak karena saldo tidak mencukupi
    const expensePromises = Array.from({ length: 5 }, (_, i) => {
      return LedgerService.appendEntry({
        campaignId,
        type: 'OUT',
        source: 'MANUAL',
        amount: 400000n,
        description: `Pengeluaran Paralel #${i + 1}`,
        proofUrl: `/uploads/proofs/nota-${i + 1}.jpg`,
        proofSha256: `sha256-proof-${i + 1}`,
      }).then(
        (val) => ({ success: true, val }),
        (err) => ({ success: false, error: err.message })
      );
    });

    const expenseResults = await Promise.all(expensePromises);

    const successful = expenseResults.filter((r) => r.success);
    const failed = expenseResults.filter((r): r is { success: false; error: string } => !r.success);

    // Tepat 2 berhasil dan 3 gagal
    expect(successful.length).toBe(2);
    expect(failed.length).toBe(3);

    // Periksa alasan penolakan pada yang gagal
    failed.forEach((f) => {
      expect(f.error).toContain('melebihi saldo tersedia');
    });

    // Periksa sisa saldo di ledger
    const balanceSummary = await LedgerService.getCampaignBalance(campaignId);
    expect(balanceSummary.saldo).toBe(200000n); // 1.000.000 - 800.000 = 200.000 (tidak pernah negatif)

    // Verifikasi keutuhan ledger tetap terjaga
    const integrity = await LedgerService.verifyCampaignLedger(campaignId);
    expect(integrity.isValid).toBe(true);
    expect(integrity.totalEntries).toBe(3); // 1 kas awal + 2 pengeluaran sah
  });

  it('varian tanpa mutex aplikasi (skipProcessMutex: true) mensimulasikan multi-pod serverless: P2002 collision di-retry otomatis dan rantai tetap 100% VALID', async () => {
    const campaignId = 'camp-serverless-retry-test';
    const PARALLEL_COUNT = 15;

    // Luncurkan 15 penulisan paralel dengan skipProcessMutex = true
    // Di sini mutex aplikasi MATI TOTAL. Tiap panggilan langsung menembus ke DB
    // Karena query latency disimulasikan 2ms, beberapa request akan membaca seq yang sama,
    // memicu collision P2002 pada create(), yang kemudian di-retry dengan backoff.
    const promises = Array.from({ length: PARALLEL_COUNT }, (_, index) => {
      return LedgerService.appendEntry({
        campaignId,
        type: 'IN',
        source: 'MIDTRANS',
        amount: BigInt(25000 + index * 500),
        fee: 175n,
        donorName: `Serverless Pod Donor #${index + 1}`,
        description: `Simulasi pod paralel ${index + 1}`,
        skipProcessMutex: true, // MUTEX APLIKASI DIMATIKAN
        maxRetries: 10,
      });
    });

    const results = await Promise.all(promises);

    // 1. Seluruh 15 penulisan harus berhasil diselesaikan lewat retry loop
    expect(results).toHaveLength(PARALLEL_COUNT);

    // 2. Ambil seluruh entri dari DB
    const savedEntries = (prisma as any)._getEntries().filter((e: any) => e.campaignId === campaignId);
    expect(savedEntries).toHaveLength(PARALLEL_COUNT);

    // 3. Pastikan seq 1..15 urut sempurna tanpa celah dan tanpa duplikat
    const seqs = savedEntries.map((e: any) => e.seq).sort((a: number, b: number) => a - b);
    const expectedSeqs = Array.from({ length: PARALLEL_COUNT }, (_, i) => i + 1);
    expect(seqs).toEqual(expectedSeqs);

    // 4. Verifikasi keutuhan hash chain: tidak boleh ada rantai bercabang
    const sorted = [...savedEntries].sort((a: any, b: any) => a.seq - b.seq);
    expect(sorted[0].prevHash).toBe(GENESIS_PREV_HASH);

    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].prevHash).toBe(sorted[i - 1].hash);
    }

    // 5. Verifikasi lewat verifyCampaignLedger
    const verification = await LedgerService.verifyCampaignLedger(campaignId);
    expect(verification.isValid).toBe(true);
    expect(verification.totalEntries).toBe(PARALLEL_COUNT);
    expect(verification.lastHash).toBe(sorted[PARALLEL_COUNT - 1].hash);
  });
});
