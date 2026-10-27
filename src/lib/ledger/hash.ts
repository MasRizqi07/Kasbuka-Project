import crypto from 'node:crypto';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export type LedgerEntryType = 'IN' | 'OUT' | 'REVERSAL';
export type LedgerEntrySource = 'MIDTRANS' | 'MANUAL';

export interface LedgerEntryPayload {
  campaignId: string;
  seq: number;
  type: LedgerEntryType;
  source: LedgerEntrySource;
  amount: bigint | string | number;
  fee: bigint | string | number;
  occurredAt: string; // ISO 8601 string
  donorName?: string | null;
  isAnonymous: boolean;
  message?: string | null;
  description?: string | null;
  proofUrl?: string | null;
  proofSha256?: string | null;
  reversesEntryId?: string | null;
}

/**
 * Menghasilkan representasi JSON kanonikal dengan kunci yang terurut secara deterministik.
 * Nilai BigInt diubah menjadi string desimal untuk konsistensi.
 */
export function canonicalJsonStringify(payload: LedgerEntryPayload): string {
  const canonicalObj = {
    amount: payload.amount.toString(),
    campaignId: payload.campaignId,
    description: payload.description ?? null,
    donorName: payload.isAnonymous ? 'Anonim' : (payload.donorName ?? null),
    fee: (payload.fee ?? 0).toString(),
    isAnonymous: Boolean(payload.isAnonymous),
    message: payload.message ?? null,
    occurredAt: new Date(payload.occurredAt).toISOString(),
    proofSha256: payload.proofSha256 ?? null,
    proofUrl: payload.proofUrl ?? null,
    reversesEntryId: payload.reversesEntryId ?? null,
    seq: Number(payload.seq),
    source: payload.source,
    type: payload.type,
  };

  // Urutkan kunci secara alfabetis
  const sortedKeys = Object.keys(canonicalObj).sort() as (keyof typeof canonicalObj)[];
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedObj[k] = canonicalObj[k];
  }

  return JSON.stringify(sortedObj);
}

/**
 * Menghitung hash SHA-256 rantai ledger:
 * hash = SHA-256(prevHash + canonical JSON dari field entri)
 */
export function computeEntryHash(prevHash: string, payload: LedgerEntryPayload): string {
  const canonicalJson = canonicalJsonStringify(payload);
  const dataToHash = prevHash + canonicalJson;
  return crypto.createHash('sha256').update(dataToHash, 'utf8').digest('hex');
}
