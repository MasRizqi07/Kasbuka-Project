import React from 'react';

interface SaldoEquationProps {
  totalMasuk: bigint | string | number;
  totalKeluar: bigint | string | number;
  saldo: bigint | string | number;
  totalEntries: number;
  targetAmount?: bigint | string | number | null;
}

export function formatRupiahDisplay(num: bigint | string | number): string {
  const n = typeof num === 'bigint' ? num : BigInt(num || 0);
  const isNeg = n < 0n;
  const abs = isNeg ? -n : n;
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (isNeg ? '− Rp ' : 'Rp ') + formatted;
}

export const SaldoEquation: React.FC<SaldoEquationProps> = ({
  totalMasuk,
  totalKeluar,
  saldo,
  totalEntries,
  targetAmount,
}) => {
  const masukNum = typeof totalMasuk === 'bigint' ? totalMasuk : BigInt(totalMasuk || 0);
  const keluarNum = typeof totalKeluar === 'bigint' ? totalKeluar : BigInt(totalKeluar || 0);
  const saldoNum = typeof saldo === 'bigint' ? saldo : BigInt(saldo || 0);

  const targetBigInt = targetAmount ? BigInt(targetAmount) : null;
  const targetPercent = targetBigInt && targetBigInt > 0n
    ? Math.min(100, Math.round(Number((masukNum * 100n) / targetBigInt)))
    : null;

  return (
    <div
      style={{
        background: 'var(--putih)',
        border: '1px solid var(--garis)',
        padding: '24px 28px',
        margin: '20px 0',
      }}
      role="region"
      aria-label="Ringkasan Perhitungan Saldo"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '17px', fontWeight: 500 }}>
          <div style={{ color: 'var(--tinta-redup)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, width: '16px', display: 'inline-block' }}>+</span> Masuk
          </div>
          <div className="tabular-angka" style={{ color: 'var(--masuk)', fontWeight: 700, textAlign: 'right' }}>
            {formatRupiahDisplay(masukNum)}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '17px', fontWeight: 500 }}>
          <div style={{ color: 'var(--tinta-redup)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, width: '16px', display: 'inline-block' }}>−</span> Keluar
          </div>
          <div className="tabular-angka" style={{ color: 'var(--keluar)', fontWeight: 700, textAlign: 'right' }}>
            {formatRupiahDisplay(keluarNum)}
          </div>
        </div>

        <hr
          style={{
            border: 'none',
            borderTop: '3px double var(--garis-tegas)',
            margin: '6px 0 10px 0',
          }}
          aria-hidden="true"
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--tinta)' }}>Saldo</div>
          <div
            className="tabular-angka"
            style={{ fontSize: '34px', fontWeight: 800, color: 'var(--tinta)', letterSpacing: '-0.02em', textAlign: 'right' }}
          >
            {formatRupiahDisplay(saldoNum)}
          </div>
        </div>
      </div>

      {targetBigInt && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--tinta-redup)', marginBottom: '6px' }}>
            <span>Target {formatRupiahDisplay(targetBigInt)}</span>
            <span>{targetPercent}% terkumpul</span>
          </div>
          <div style={{ height: '6px', backgroundColor: 'var(--blok)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: 'var(--tinta)', width: `${targetPercent}%` }} />
          </div>
        </div>
      )}

      <p
        style={{
          fontSize: '13.5px',
          color: 'var(--tinta-redup)',
          marginTop: '14px',
          paddingTop: '10px',
          borderTop: '1px solid var(--garis)',
        }}
      >
        Dihitung dari {totalEntries} entri. Masuk dihitung setelah biaya Midtrans.
      </p>
    </div>
  );
};
