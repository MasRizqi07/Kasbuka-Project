/**
 * Konfigurasi Estimasi Biaya Midtrans (D3 & Bagian 4.4)
 * 
 * Biaya Midtrans dicatat sebagai estimasi berlabel, dihitung dari tabel tarif konfigurasi per payment_type.
 * Kolom feeSource bernilai 'ESTIMATED'.
 * Jika payment_type tidak ada di tabel tarif:
 *   fee = 0n, feeSource = 'UNKNOWN', dan peringatan ditampilkan di dasbor.
 * 
 * Tanggal verifikasi tarif terakhir: 2026-11-03
 * Referensi resmi: Halaman Tarif Midtrans Indonesia (https://midtrans.com/pricing)
 */

export interface FeeCalculationResult {
  fee: bigint;
  feeSource: 'ESTIMATED' | 'UNKNOWN';
}

type FeeRule =
  | { type: 'fixed'; fixedRupiah: bigint }
  | { type: 'percentage'; basisPoints: bigint; fixedRupiah?: bigint };

// Tabel tarif terverifikasi per payment_type Midtrans
// basisPoints 70 = 0.70%, 200 = 2.00%, 290 = 2.90%
export const MIDTRANS_FEE_RATES: Record<string, FeeRule> = {
  // QRIS (GoPay, ShopeePay, Dana, OVO, LinkAja via QRIS) - 0.7%
  qris: { type: 'percentage', basisPoints: 70n },
  gopay: { type: 'percentage', basisPoints: 200n },
  shopeepay: { type: 'percentage', basisPoints: 200n },
  
  // Virtual Account / Bank Transfer - Rp 4.000 flat per transaksi berhasil
  bank_transfer: { type: 'fixed', fixedRupiah: 4000n },
  bca_va: { type: 'fixed', fixedRupiah: 4000n },
  bni_va: { type: 'fixed', fixedRupiah: 4000n },
  bri_va: { type: 'fixed', fixedRupiah: 4000n },
  permata_va: { type: 'fixed', fixedRupiah: 4000n },
  echannel: { type: 'fixed', fixedRupiah: 4000n }, // Mandiri Bill

  // Convenience Store (Indomaret / Alfamart) - Rp 5.000 flat
  cstore: { type: 'fixed', fixedRupiah: 5000n },

  // Kartu Kredit - 2.9% + Rp 2.000
  credit_card: { type: 'percentage', basisPoints: 290n, fixedRupiah: 2000n },
};

/**
 * Menghitung estimasi biaya transaksi Midtrans berdasarkan payment_type dan nominal rupiah.
 */
export function calculateMidtransFee(
  paymentType: string | null | undefined,
  grossAmount: bigint
): FeeCalculationResult {
  if (!paymentType) {
    return { fee: 0n, feeSource: 'UNKNOWN' };
  }

  const normalizedType = paymentType.trim().toLowerCase();
  const rule = MIDTRANS_FEE_RATES[normalizedType];

  if (!rule) {
    return { fee: 0n, feeSource: 'UNKNOWN' };
  }

  let calculatedFee = 0n;

  if (rule.type === 'fixed') {
    calculatedFee = rule.fixedRupiah;
  } else if (rule.type === 'percentage') {
    // basisPoints / 10000 (contoh: 70n / 10000n = 0.007)
    calculatedFee = (grossAmount * rule.basisPoints) / 10000n;
    if (rule.fixedRupiah) {
      calculatedFee += rule.fixedRupiah;
    }
  }

  // Pengaman: Fee tidak boleh melebihi nominal kotor
  if (calculatedFee > grossAmount) {
    calculatedFee = grossAmount;
  }

  return {
    fee: calculatedFee,
    feeSource: 'ESTIMATED',
  };
}

