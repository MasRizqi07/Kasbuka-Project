import { prisma } from '../prisma';
import type { Prisma, LedgerEntry } from '@prisma/client';
import {
  GENESIS_PREV_HASH,
  computeEntryHash,
  type LedgerEntryType,
  type LedgerEntrySource,
} from './hash';
import { calculateLedgerBalance } from './balance';
import { verifyLedgerIntegrity } from './verifier';

export interface CreateEntryParams {
  campaignId: string;
  type: LedgerEntryType;
  source: LedgerEntrySource;
  amount: bigint;
  fee?: bigint;
  feeSource?: string | null;
  paymentType?: string | null;
  donationId?: string | null;
  occurredAt?: Date;
  donorName?: string | null;
  isAnonymous?: boolean;
  message?: string | null;
  description?: string | null;
  proofUrl?: string | null;
  proofSha256?: string | null;
  reversesEntryId?: string | null;
  createdById?: string | null;
  skipProcessMutex?: boolean;
  skipAdvisoryLock?: boolean; // Khusus pengetesan database, dilarang di production
  maxRetries?: number;
}

// Map antrean mutex per campaignId untuk mencegah race condition pada level proses
const campaignMutexMap = new Map<string, Promise<unknown>>();

/**
 * Mengantrekan (serialize) eksekusi operasi per campaignId
 * Memastikan request paralel tidak membaca state lama atau memecah hash chain.
 */
export async function withCampaignLock<T>(campaignId: string, task: () => Promise<T>): Promise<T> {
  const previousTask = campaignMutexMap.get(campaignId) || Promise.resolve();

  let releaseLock: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Pasang lock baru untuk antrean campaign ini
  campaignMutexMap.set(campaignId, nextLock);

  try {
    // Tunggu antrean transaksi sebelumnya pada campaign ini selesai
    await previousTask;
    return await task();
  } finally {
    releaseLock!();
    if (campaignMutexMap.get(campaignId) === nextLock) {
      campaignMutexMap.delete(campaignId);
    }
  }
}

/**
 * Deteksi benturan nomor urut sequence (campaignId, seq) P2002 dari Prisma.
 * Menjamin bahwa collision pada tabel/kolom lain (misalnya Donation.orderId) TIDAK di-retry.
 */
export function isSeqCollisionError(err: unknown): boolean {
  const prismaError = err as { code?: string; meta?: { modelName?: string; target?: string[] | string } };
  if (prismaError?.code !== 'P2002') return false;

  const target = prismaError.meta?.target;
  const modelName = prismaError.meta?.modelName;

  if (Array.isArray(target)) {
    return target.includes('seq') && (target.includes('campaignId') || modelName === 'LedgerEntry');
  }

  if (typeof target === 'string') {
    return target.includes('seq') && (target.includes('campaignId') || target.includes('LedgerEntry'));
  }

  const msg = (err as Error)?.message;
  if (msg) {
    return (
      msg.includes('(`campaignId`,`seq`)') ||
      msg.includes('LedgerEntry_campaignId_seq_key') ||
      msg.includes('(campaignId, seq)')
    );
  }

  return false;
}

/**
 * Helper retry untuk pemanggil transaksi (Fase 3.5b & Fase 4 webhook).
 * Menjalankan fungsi transaksi dan mengulang HANYA jika terjadi benturan sequence (campaignId, seq).
 */
export async function withSeqRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err: unknown) {
      if (isSeqCollisionError(err) && attempt <= maxRetries) {
        // Collision di level unique constraint DB @@unique([campaignId, seq])
        // Exponential jittered backoff agar transaksi berikutnya membaca seq & prevHash terbaru
        const jitterMs = Math.floor(Math.random() * 15) + attempt * 5;
        await new Promise((res) => setTimeout(res, jitterMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Eksekusi atomik satu entri di dalam transaksi Prisma.
 */
async function appendEntryCore(
  tx: Prisma.TransactionClient,
  params: CreateEntryParams
): Promise<LedgerEntry> {
  // 3.1 & 3.5: Lock PostgreSQL advisory lock. Gagal keras jika lock gagal atau error.
  if (params.skipAdvisoryLock) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('skipAdvisoryLock tidak boleh aktif di production.');
    }
  } else {
    if (typeof (tx as { $executeRawUnsafe?: unknown }).$executeRawUnsafe !== 'function') {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('tx.$executeRawUnsafe tidak tersedia di luar lingkungan test.');
      }
    } else {
      await (tx as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        params.campaignId
      );
    }
  }

  // Validasi B.1: amount harus > 0n
  if (params.amount <= 0n) {
    throw new Error('Nominal entri ledger harus lebih besar dari 0.');
  }

  // Validasi B.2: fee harus >= 0n, <= amount untuk IN, dan 0n untuk OUT dan REVERSAL
  const fee = params.fee ?? 0n;
  if (fee < 0n) {
    throw new Error('Fee tidak boleh negatif.');
  }
  if (params.type === 'IN') {
    if (fee > params.amount) {
      throw new Error('Fee tidak boleh melebihi nominal pemasukan (amount).');
    }
  } else {
    if (fee !== 0n) {
      throw new Error(`Fee untuk entri ${params.type} harus 0n.`);
    }
  }

  // 1. Ambil entri terakhir dari campaign secara eksklusif dalam transaksi
  const lastEntry = await tx.ledgerEntry.findFirst({
    where: { campaignId: params.campaignId },
    orderBy: { seq: 'desc' },
  });

  const nextSeq = (lastEntry?.seq ?? 0) + 1;
  const prevHash = lastEntry?.hash ?? GENESIS_PREV_HASH;
  const occurredAt = params.occurredAt ?? new Date();

  // 2. Jika pengeluaran (OUT), validasi saldo dalam transaksi yang SAMA
  if (params.type === 'OUT') {
    const allEntries = await tx.ledgerEntry.findMany({
      where: { campaignId: params.campaignId },
    });

    const financial = calculateLedgerBalance(
      allEntries.map((e) => ({
        id: e.id,
        seq: e.seq,
        type: e.type,
        amount: e.amount,
        fee: e.fee,
        reversesEntryId: e.reversesEntryId,
      }))
    );

    if (params.amount > financial.saldo) {
      throw new Error(
        `Nominal pengeluaran (Rp ${params.amount}) melebihi saldo tersedia (Rp ${financial.saldo}).`
      );
    }

    if (!params.proofUrl && !params.proofSha256) {
      throw new Error('Bukti foto nota wajib dilampirkan untuk entri pengeluaran.');
    }
  }

  // 3. Jika REVERSAL, validasi entri target (Validasi B.3)
  if (params.type === 'REVERSAL') {
    if (!params.reversesEntryId) {
      throw new Error('reversesEntryId wajib diisi untuk entri tipe REVERSAL.');
    }

    // Pastikan entri target ada di campaign ini
    const targetEntry = await tx.ledgerEntry.findFirst({
      where: {
        id: params.reversesEntryId,
        campaignId: params.campaignId,
      },
    });

    if (!targetEntry) {
      throw new Error(`Entri yang ingin dibatalkan (#${params.reversesEntryId}) tidak ditemukan.`);
    }

    // Target reversal harus bertipe IN atau OUT (reversal atas reversal dilarang)
    if (targetEntry.type !== 'IN' && targetEntry.type !== 'OUT') {
      throw new Error(`Entri target reversal harus bertipe IN atau OUT (ditemukan: ${targetEntry.type}).`);
    }

    // Nominal reversal harus sama persis dengan nominal entri target
    if (params.amount !== targetEntry.amount) {
      throw new Error(
        `Nominal reversal (Rp ${params.amount}) harus sama persis dengan nominal entri target (Rp ${targetEntry.amount}).`
      );
    }

    // Pastikan belum pernah dibatalkan (US-5: tidak boleh dibatalkan dua kali)
    const existingReversal = await tx.ledgerEntry.findFirst({
      where: {
        campaignId: params.campaignId,
        reversesEntryId: params.reversesEntryId,
      },
    });

    if (existingReversal) {
      const err = new Error(
        `Entri #${targetEntry.seq} sudah dibatalkan sebelumnya oleh entri #${existingReversal.seq}.`
      );
      (err as unknown as { code: string }).code = 'REVERSAL_CONFLICT';
      throw err;
    }
  }

  // 4. Hitung SHA-256 hash rantai (mencakup donationId, paymentType, feeSource - Bagian D)
  const payload = {
    campaignId: params.campaignId,
    seq: nextSeq,
    type: params.type,
    source: params.source,
    amount: params.amount,
    fee,
    feeSource: params.feeSource ?? null,
    paymentType: params.paymentType ?? null,
    donationId: params.donationId ?? null,
    occurredAt: occurredAt.toISOString(),
    donorName: params.donorName ?? null,
    isAnonymous: Boolean(params.isAnonymous),
    message: params.message ?? null,
    description: params.description ?? null,
    proofUrl: params.proofUrl ?? null,
    proofSha256: params.proofSha256 ?? null,
    reversesEntryId: params.reversesEntryId ?? null,
  };

  const hash = computeEntryHash(prevHash, payload);

  // 5. Simpan entri baru ke basis data
  const created = await tx.ledgerEntry.create({
    data: {
      campaignId: params.campaignId,
      seq: nextSeq,
      type: params.type,
      source: params.source,
      amount: params.amount,
      fee,
      feeSource: params.feeSource ?? null,
      paymentType: params.paymentType ?? null,
      donationId: params.donationId ?? null,
      occurredAt,
      donorName: params.donorName ?? null,
      isAnonymous: Boolean(params.isAnonymous),
      message: params.message ?? null,
      description: params.description ?? null,
      proofUrl: params.proofUrl ?? null,
      proofSha256: params.proofSha256 ?? null,
      reversesEntryId: params.reversesEntryId ?? null,
      createdById: params.createdById ?? null,
      prevHash,
      hash,
    },
  });

  return created;
}

/**
 * Service untuk operasi append-only ledger Kasbuka.
 * Menegakkan:
 * - Append-only (tidak ada edit/delete)
 * - Rantai hash SHA-256
 * - Serialisasi konkurensi (mencegah branching hash chain)
 * - Validasi saldo untuk pengeluaran (OUT) dalam transaksi yang sama
 * - Validasi reversal tidak boleh ganda (409 Conflict)
 */
export class LedgerService {
  /**
   * Menambahkan entri baru ke ledger secara terurut, aman konkurensi, dan atomik.
   * Signature tunggal: appendEntry(params, tx?)
   */
  static async appendEntry(
    params: CreateEntryParams,
    tx?: Prisma.TransactionClient
  ): Promise<LedgerEntry> {
    // Guard A: Jika tx diberikan, pastikan BUKAN klien Prisma global ($transaction terdeteksi)
    if (tx) {
      if (typeof (tx as { $transaction?: unknown }).$transaction === 'function') {
        throw new Error(
          'Parameter tx tidak boleh berupa klien Prisma global ($transaction terdeteksi). Wajib berupa Prisma.TransactionClient.'
        );
      }
      return await appendEntryCore(tx, params);
    }

    // Kalau tx tidak diberikan, jalankan dalam prisma.$transaction dengan helper withSeqRetry
    const execute = () =>
      withSeqRetry(
        () => prisma.$transaction((t) => appendEntryCore(t, params)),
        params.maxRetries ?? 5
      );

    if (params.skipProcessMutex) {
      return execute();
    }

    return withCampaignLock(params.campaignId, execute);
  }

  /**
   * Menghitung saldo campaign terkini murni dari ledger
   */
  static async getCampaignBalance(
    campaignId: string,
    client: { ledgerEntry: { findMany: typeof prisma.ledgerEntry.findMany } } = prisma
  ) {
    const entries = await client.ledgerEntry.findMany({
      where: { campaignId },
      orderBy: { seq: 'asc' },
    });

    return calculateLedgerBalance(
      entries.map((e) => ({
        id: e.id,
        seq: e.seq,
        type: e.type,
        amount: e.amount,
        fee: e.fee,
        reversesEntryId: e.reversesEntryId,
      }))
    );
  }

  /**
   * Memverifikasi integritas hash chain sebuah campaign
   */
  static async verifyCampaignLedger(
    campaignId: string,
    client: { ledgerEntry: { findMany: typeof prisma.ledgerEntry.findMany } } = prisma
  ) {
    const entries = await client.ledgerEntry.findMany({
      where: { campaignId },
      orderBy: { seq: 'asc' },
    });

    return verifyLedgerIntegrity(
      entries.map((e) => ({
        id: e.id,
        campaignId: e.campaignId,
        seq: e.seq,
        type: e.type,
        source: e.source,
        amount: e.amount,
        fee: e.fee,
        feeSource: (e as { feeSource?: string | null }).feeSource ?? null,
        paymentType: (e as { paymentType?: string | null }).paymentType ?? null,
        donationId: (e as { donationId?: string | null }).donationId ?? null,
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
  }
}
