import type { LedgerEntryType } from './hash';

export interface LedgerBalanceEntry {
  id: string;
  seq: number;
  type: LedgerEntryType;
  amount: bigint | string | number;
  fee: bigint | string | number;
  reversesEntryId?: string | null;
}

export interface LedgerFinancialSummary {
  totalMasukBersih: bigint;
  totalKeluar: bigint;
  saldo: bigint;
  reversedEntryIds: Set<string>;
  runningBalances: Map<number, bigint>;
}

/**
 * Menghitung saldo dan ringkasan keuangan dari ledger Kasbuka:
 * Saldo = Σ(IN - fee) - Σ(OUT), dengan REVERSAL membalik efek entri yang dirujuk.
 * Saldo dihitung murni dari ledger (tidak disimpan sebagai kolom mutabel).
 */
export function calculateLedgerBalance(entries: LedgerBalanceEntry[]): LedgerFinancialSummary {
  // 1. Urutkan entri kronologis berdasarkan nomor urut (seq 1, 2, 3...)
  const sortedEntries = [...entries].sort((a, b) => Number(a.seq) - Number(b.seq));

  // 2. Identifikasi entri yang dibatalkan oleh REVERSAL
  const reversedEntryIds = new Set<string>();
  const reversalMap = new Map<string, string>(); // targetId -> reversalId

  for (const entry of sortedEntries) {
    if (entry.type === 'REVERSAL' && entry.reversesEntryId) {
      if (reversedEntryIds.has(entry.reversesEntryId)) {
        throw new Error(`Entri #${entry.reversesEntryId} sudah dibatalkan sebelumnya dan tidak dapat dibatalkan lagi.`);
      }
      reversedEntryIds.add(entry.reversesEntryId);
      reversalMap.set(entry.reversesEntryId, entry.id);
    }
  }

  // 3. Peta entri berdasarkan ID untuk kalkulasi efek pembalikan
  const entryById = new Map<string, LedgerBalanceEntry>();
  for (const entry of sortedEntries) {
    entryById.set(entry.id, entry);
  }

  let totalMasukBersih = 0n;
  let totalKeluar = 0n;
  let runningBalance = 0n;
  const runningBalances = new Map<number, bigint>();

  // 4. Hitung berjalan per entri secara kronologis
  for (const entry of sortedEntries) {
    const amount = BigInt(entry.amount);
    const fee = BigInt(entry.fee ?? 0);
    const isReversed = reversedEntryIds.has(entry.id);

    if (entry.type === 'IN') {
      const net = amount - fee;
      if (!isReversed) {
        totalMasukBersih += net;
      }
      // Running balance kronologis pada saat transaksi terjadi
      runningBalance += net;
    } else if (entry.type === 'OUT') {
      if (!isReversed) {
        totalKeluar += amount;
      }
      // Running balance kronologis pada saat transaksi terjadi
      runningBalance -= amount;
    } else if (entry.type === 'REVERSAL' && entry.reversesEntryId) {
      const target = entryById.get(entry.reversesEntryId);
      if (target) {
        const targetAmount = BigInt(target.amount);
        const targetFee = BigInt(target.fee ?? 0);

        if (target.type === 'OUT') {
          // Pengeluaran dibatalkan -> saldo kas bertambah kembali pada entri reversal
          runningBalance += targetAmount;
        } else if (target.type === 'IN') {
          // Pemasukan dibatalkan -> saldo berkurang pada entri reversal
          runningBalance -= (targetAmount - targetFee);
        }
      }
    }

    runningBalances.set(Number(entry.seq), runningBalance);
  }

  const saldo = totalMasukBersih - totalKeluar;

  return {
    totalMasukBersih,
    totalKeluar,
    saldo,
    reversedEntryIds,
    runningBalances,
  };
}
