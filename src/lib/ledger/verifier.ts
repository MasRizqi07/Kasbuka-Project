import {
  GENESIS_PREV_HASH,
  computeEntryHash,
  type LedgerEntryPayload,
} from './hash';

export interface VerifiableLedgerEntry extends LedgerEntryPayload {
  id: string;
  hash: string;
  prevHash: string;
}

export interface VerificationResult {
  isValid: boolean;
  totalEntries: number;
  lastHash?: string;
  corruptEntrySeq?: number;
  corruptEntryId?: string;
  errorReason?: string;
}

/**
 * Memverifikasi keutuhan rantai hash ledger (SHA-256 Hash Chain).
 * Menghitung ulang seluruh rantai hash dari awal (seq 1) sampai akhir.
 * Jika ditemukan ketidaksesuaian nilai payload, manipulasi database langsung,
 * atau putusnya prevHash, mengidentifikasi entri pertama yang rusak (RUSAK di entri #N).
 */
export function verifyLedgerIntegrity(entries: VerifiableLedgerEntry[]): VerificationResult {
  if (entries.length === 0) {
    return {
      isValid: true,
      totalEntries: 0,
      lastHash: GENESIS_PREV_HASH,
    };
  }

  // 1. Urutkan berdasarkan nomor urut (seq 1, 2, 3...)
  const sorted = [...entries].sort((a, b) => Number(a.seq) - Number(b.seq));

  let expectedPrevHash = GENESIS_PREV_HASH;

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const currentSeq = Number(entry.seq);
    const expectedSeq = i + 1;

    // A. Periksa urutan nomor seq (tidak boleh lompat atau duplikat)
    if (currentSeq !== expectedSeq) {
      return {
        isValid: false,
        totalEntries: entries.length,
        corruptEntrySeq: currentSeq,
        corruptEntryId: entry.id,
        errorReason: `Urutan nomor seq terputus. Diharapkan seq #${expectedSeq}, ditemukan seq #${currentSeq}.`,
      };
    }

    // B. Periksa kontinuitas prevHash
    if (entry.prevHash !== expectedPrevHash) {
      return {
        isValid: false,
        totalEntries: entries.length,
        corruptEntrySeq: currentSeq,
        corruptEntryId: entry.id,
        errorReason: `prevHash pada entri #${currentSeq} tidak cocok dengan hash entri sebelumnya. Terindikasi baris disisipkan atau dipindahkan.`,
      };
    }

    // C. Hitung ulang hash entri dari payload kanonikal
    const recomputedHash = computeEntryHash(entry.prevHash, entry);

    if (entry.hash !== recomputedHash) {
      return {
        isValid: false,
        totalEntries: entries.length,
        corruptEntrySeq: currentSeq,
        corruptEntryId: entry.id,
        errorReason: `Hash entri #${currentSeq} (${entry.hash}) tidak cocok dengan komputasi ulang (${recomputedHash}). Data telah dimanipulasi setelah dicatat.`,
      };
    }

    // Lanjutkan rantai
    expectedPrevHash = entry.hash;
  }

  return {
    isValid: true,
    totalEntries: sorted.length,
    lastHash: sorted[sorted.length - 1].hash,
  };
}
