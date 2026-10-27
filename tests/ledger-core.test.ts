import { describe, it, expect } from 'vitest';
import {
  GENESIS_PREV_HASH,
  computeEntryHash,
  canonicalJsonStringify,
  type LedgerEntryPayload,
} from '@/lib/ledger/hash';
import { calculateLedgerBalance, type LedgerBalanceEntry } from '@/lib/ledger/balance';
import { verifyLedgerIntegrity, type VerifiableLedgerEntry } from '@/lib/ledger/verifier';
import { PUT, PATCH, DELETE } from '@/app/api/admin/entries/[id]/route';

describe('Fase 2 Evidence Gate: Inti Ledger Append-Only, Hash Chain & Tamper Test', () => {

  describe('1. Komputasi Hash Chain & Genesis 64 Nol (PRD Bagian 4)', () => {
    it('entri pertama (genesis) harus menggunakan prevHash berisi 64 nol', () => {
      expect(GENESIS_PREV_HASH).toBe('0000000000000000000000000000000000000000000000000000000000000000');
      expect(GENESIS_PREV_HASH.length).toBe(64);
    });

    it('canonicalJsonStringify harus menghasilkan JSON yang deterministik terurut menurut abjad kunci', () => {
      const payload: LedgerEntryPayload = {
        campaignId: 'camp-123',
        seq: 1,
        type: 'IN',
        source: 'MANUAL',
        amount: 10000000n,
        fee: 0n,
        occurredAt: '2026-10-22T00:00:00.000Z',
        description: 'Saldo awal dari kas takmir',
        isAnonymous: false,
        donorName: 'Kas Takmir',
      };

      const json = canonicalJsonStringify(payload);
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed);
      const sortedKeys = [...keys].sort();

      expect(keys).toEqual(sortedKeys);
      expect(parsed.amount).toBe('10000000');
      expect(parsed.fee).toBe('0');
      expect(parsed.donorName).toBe('Kas Takmir');
    });

    it('hash SHA-256 harus konsisten dan berubah jika satu karakter payload berubah', () => {
      const payloadA: LedgerEntryPayload = {
        campaignId: 'camp-123',
        seq: 1,
        type: 'IN',
        source: 'MANUAL',
        amount: 10000000n,
        fee: 0n,
        occurredAt: '2026-10-22T00:00:00.000Z',
        isAnonymous: false,
      };

      const payloadB: LedgerEntryPayload = {
        ...payloadA,
        amount: 10000001n, // Beda 1 rupiah
      };

      const hashA = computeEntryHash(GENESIS_PREV_HASH, payloadA);
      const hashB = computeEntryHash(GENESIS_PREV_HASH, payloadB);

      expect(hashA).toHaveLength(64);
      expect(hashB).toHaveLength(64);
      expect(hashA).not.toEqual(hashB);
    });
  });

  describe('2. Kalkulasi Saldo Murni Ledger & Reversal (PRD US-1, US-5)', () => {
    it('harus menghitung saldo murni: Masuk - Fee - Keluar', () => {
      const entries: LedgerBalanceEntry[] = [
        { id: '1', seq: 1, type: 'IN', amount: 10000000n, fee: 0n },
        { id: '2', seq: 2, type: 'IN', amount: 100000n, fee: 700n }, // Net: 99.300
        { id: '3', seq: 3, type: 'OUT', amount: 3000000n, fee: 0n },
      ];

      const result = calculateLedgerBalance(entries);

      expect(result.totalMasukBersih).toBe(10099300n);
      expect(result.totalKeluar).toBe(3000000n);
      expect(result.saldo).toBe(7099300n);
      expect(result.runningBalances.get(1)).toBe(10000000n);
      expect(result.runningBalances.get(2)).toBe(10099300n);
      expect(result.runningBalances.get(3)).toBe(7099300n);
    });

    it('entri REVERSAL harus membatalkan efek entri pengeluaran sebelumnya (saldo pulih kembali)', () => {
      const entries: LedgerBalanceEntry[] = [
        { id: 'e1', seq: 1, type: 'IN', amount: 10000000n, fee: 0n },
        { id: 'e2', seq: 2, type: 'OUT', amount: 4500000n, fee: 0n }, // Entri salah nominal
        { id: 'e3', seq: 3, type: 'REVERSAL', amount: 0n, fee: 0n, reversesEntryId: 'e2' }, // Pembatalan e2
        { id: 'e4', seq: 4, type: 'OUT', amount: 4800000n, fee: 0n }, // Entri yang benar
      ];

      const result = calculateLedgerBalance(entries);

      expect(result.reversedEntryIds.has('e2')).toBe(true);
      expect(result.totalKeluar).toBe(4800000n); // e2 tidak dihitung lagi
      expect(result.saldo).toBe(5200000n); // 10.000.000 - 4.800.000 = 5.200.000
      expect(result.runningBalances.get(2)).toBe(5500000n);
      expect(result.runningBalances.get(3)).toBe(10000000n); // Saldo pulih kembali di e3
      expect(result.runningBalances.get(4)).toBe(5200000n);
    });

    it('menolak pembatalan ganda (reversal terhadap entri yang sudah dibatalkan)', () => {
      const entries: LedgerBalanceEntry[] = [
        { id: 'e1', seq: 1, type: 'IN', amount: 10000000n, fee: 0n },
        { id: 'e2', seq: 2, type: 'OUT', amount: 1000000n, fee: 0n },
        { id: 'e3', seq: 3, type: 'REVERSAL', amount: 0n, fee: 0n, reversesEntryId: 'e2' },
        { id: 'e4', seq: 4, type: 'REVERSAL', amount: 0n, fee: 0n, reversesEntryId: 'e2' }, // Mencoba batalkan lagi
      ];

      expect(() => calculateLedgerBalance(entries)).toThrowError(
        /sudah dibatalkan sebelumnya dan tidak dapat dibatalkan lagi/
      );
    });
  });

  describe('3. Verifikasi Integritas Rantai & TAMPER TEST (PRD US-5, US-6)', () => {
    // Bangun rantai 5 entri valid yang saling terhubung SHA-256
    function buildValidChain(): VerifiableLedgerEntry[] {
      const rawData = [
        { type: 'IN' as const, source: 'MANUAL' as const, amount: 10000000n, fee: 0n, desc: 'Kas Awal' },
        { type: 'IN' as const, source: 'MIDTRANS' as const, amount: 5000000n, fee: 35000n, desc: 'Donasi Pak Budi' },
        { type: 'OUT' as const, source: 'MANUAL' as const, amount: 4500000n, fee: 0n, desc: 'Semen & Pasir' },
        { type: 'REVERSAL' as const, source: 'MANUAL' as const, amount: 0n, fee: 0n, desc: 'Batal #3', revId: 'entry-3' },
        { type: 'OUT' as const, source: 'MANUAL' as const, amount: 4800000n, fee: 0n, desc: 'Semen & Pasir (Koreksi)' },
      ];

      const chain: VerifiableLedgerEntry[] = [];
      let prev = GENESIS_PREV_HASH;

      for (let i = 0; i < rawData.length; i++) {
        const item = rawData[i];
        const seq = i + 1;
        const id = `entry-${seq}`;
        const payload: LedgerEntryPayload = {
          campaignId: 'camp-masjid-01',
          seq,
          type: item.type,
          source: item.source,
          amount: item.amount,
          fee: item.fee,
          occurredAt: `2026-10-2${i + 1}T08:00:00.000Z`,
          description: item.desc,
          isAnonymous: false,
          reversesEntryId: item.revId ?? null,
        };

        const hash = computeEntryHash(prev, payload);
        chain.push({
          ...payload,
          id,
          prevHash: prev,
          hash,
        });

        prev = hash;
      }

      return chain;
    }

    it('rantai asli yang tidak diubah harus lolos verifikasi dengan status VALID', () => {
      const validChain = buildValidChain();
      const result = verifyLedgerIntegrity(validChain);

      expect(result.isValid).toBe(true);
      expect(result.totalEntries).toBe(5);
      expect(result.lastHash).toBe(validChain[4].hash);
      expect(result.corruptEntrySeq).toBeUndefined();
    });

    it('TAMPER TEST A: Memodifikasi nominal di database secara diam-diam harus terdeteksi RUSAK di entri bersangkutan', () => {
      const tamperedChain = buildValidChain();
      
      // Simulasi manipulasi baris langsung di DB: ubah nominal entri #2 dari 5.000.000 menjadi 50.000.000
      tamperedChain[1].amount = 50000000n;

      const result = verifyLedgerIntegrity(tamperedChain);

      expect(result.isValid).toBe(false);
      expect(result.corruptEntrySeq).toBe(2);
      expect(result.corruptEntryId).toBe('entry-2');
      expect(result.errorReason).toContain('tidak cocok dengan komputasi ulang');
      expect(result.errorReason).toContain('Data telah dimanipulasi setelah dicatat');
    });

    it('TAMPER TEST B: Memanipulasi deskripsi atau bukti nota harus terdeteksi RUSAK di entri tersebut', () => {
      const tamperedChain = buildValidChain();

      // Simulasi manipulasi teks keterangan di baris entri #3
      tamperedChain[2].description = 'Beli cat dinding (keterangan palsu)';

      const result = verifyLedgerIntegrity(tamperedChain);

      expect(result.isValid).toBe(false);
      expect(result.corruptEntrySeq).toBe(3);
      expect(result.corruptEntryId).toBe('entry-3');
      expect(result.errorReason).toContain('Hash entri #3');
    });

    it('TAMPER TEST C: Menghapus baris secara diam-diam harus terdeteksi putus nomor urut seq', () => {
      const tamperedChain = buildValidChain();

      // Hapus entri #3 (sehingga seq menjadi 1, 2, 4, 5)
      tamperedChain.splice(2, 1);

      const result = verifyLedgerIntegrity(tamperedChain);

      expect(result.isValid).toBe(false);
      expect(result.corruptEntrySeq).toBe(4);
      expect(result.errorReason).toContain('Urutan nomor seq terputus');
      expect(result.errorReason).toContain('Diharapkan seq #3, ditemukan seq #4');
    });

    it('TAMPER TEST D: Memodifikasi prevHash (simulasi penyisipan baris) harus terdeteksi terputus', () => {
      const tamperedChain = buildValidChain();

      // Ubah prevHash entri #4
      tamperedChain[3].prevHash = 'a'.repeat(64);

      const result = verifyLedgerIntegrity(tamperedChain);

      expect(result.isValid).toBe(false);
      expect(result.corruptEntrySeq).toBe(4);
      expect(result.errorReason).toContain('prevHash pada entri #4 tidak cocok dengan hash entri sebelumnya');
    });
  });

  describe('4. Immutability Enforcer: Menolak PUT, PATCH, dan DELETE dengan 405 (PRD US-5, Bagian 10)', () => {
    it('permintaan PUT ke endpoint entri ledger harus mengembalikan status 405 Method Not Allowed', async () => {
      const res = await PUT();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');

      const json = await res.json();
      expect(json.error).toBe('Method Not Allowed');
      expect(json.message).toContain('append-only dan tidak dapat diubah atau dihapus');
    });

    it('permintaan PATCH ke endpoint entri ledger harus mengembalikan status 405 Method Not Allowed', async () => {
      const res = await PATCH();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');

      const json = await res.json();
      expect(json.error).toBe('Method Not Allowed');
    });

    it('permintaan DELETE ke endpoint entri ledger harus mengembalikan status 405 Method Not Allowed', async () => {
      const res = await DELETE();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET');

      const json = await res.json();
      expect(json.error).toBe('Method Not Allowed');
    });
  });
});
