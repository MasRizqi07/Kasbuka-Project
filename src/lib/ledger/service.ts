import { prisma } from '../prisma';
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
  occurredAt?: Date;
  donorName?: string | null;
  isAnonymous?: boolean;
  message?: string | null;
  description?: string | null;
  proofUrl?: string | null;
  proofSha256?: string | null;
  reversesEntryId?: string | null;
  createdById?: string | null;
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
   * Menambahkan entri baru ke ledger secara terurut, aman konkurensi, dan atomik
   */
  static async appendEntry(params: CreateEntryParams) {
    return withCampaignLock(params.campaignId, async () => {
      return prisma.$transaction(async (tx) => {
        // Coba peroleh PostgreSQL advisory lock untuk koordinasi antar-pod / instance serverless
        try {
          if (typeof (tx as { $executeRawUnsafe?: unknown }).$executeRawUnsafe === 'function') {
            await (tx as { $executeRawUnsafe: (query: string, ...args: unknown[]) => Promise<unknown> }).$executeRawUnsafe(
              `SELECT pg_advisory_xact_lock(hashtext($1))`,
              params.campaignId
            );
          }
        } catch {
          // Fallback aman untuk mock prisma atau DB testing non-Postgres
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

        // 3. Jika REVERSAL, validasi entri target
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

        // 4. Hitung SHA-256 hash rantai
        const payload = {
          campaignId: params.campaignId,
          seq: nextSeq,
          type: params.type,
          source: params.source,
          amount: params.amount,
          fee: params.fee ?? 0n,
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
            fee: params.fee ?? 0n,
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
      });
    });
  }

  /**
   * Menghitung saldo campaign terkini murni dari ledger
   */
  static async getCampaignBalance(campaignId: string) {
    const entries = await prisma.ledgerEntry.findMany({
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
  static async verifyCampaignLedger(campaignId: string) {
    const entries = await prisma.ledgerEntry.findMany({
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
