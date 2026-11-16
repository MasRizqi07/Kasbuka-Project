import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { computeEntryHash, GENESIS_PREV_HASH, type LedgerEntryPayload } from '../src/lib/ledger/hash';
import { verifyLedgerIntegrity } from '../src/lib/ledger/verifier';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding basis data Kasbuka sesuai Design.md Bagian 8...');

  // 1. Organisasi & Admin
  const org = await prisma.organization.upsert({
    where: { id: 'org-al-ikhlas-jombang' },
    update: {},
    create: {
      id: 'org-al-ikhlas-jombang',
      name: 'Takmir Musala Al-Ikhlas Dusun Karangpoh',
    },
  });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('PengurusAlIkhlas123!', salt);

  const admin = await prisma.user.upsert({
    where: { email: 'pengurus@kasbuka.org' },
    update: { organizationId: org.id },
    create: {
      email: 'pengurus@kasbuka.org',
      name: 'Bpk. Hasan (Ketua Takmir)',
      passwordHash,
      role: 'ORG_ADMIN',
      organizationId: org.id,
    },
  });

  // 2. Campaign: Atap Musala Al-Ikhlas
  const campaign = await prisma.campaign.upsert({
    where: { slug: 'atap-musala-al-ikhlas' },
    update: {},
    create: {
      organizationId: org.id,
      slug: 'atap-musala-al-ikhlas',
      title: 'Atap Musala Al-Ikhlas bocor, warga Karangpoh renovasi bersama',
      story: `Atap asbes musala kami sudah retak dan bocor sejak musim hujan tahun lalu. Setiap hujan lebat saat salat berjamaah, sebagian shaf terpaksa dipindah karena air menetes dari plafon tripleks yang lapuk.

Musala ini menjadi tempat ibadah harian warga Dusun Karangpoh dan kegiatan mengaji sekitar 40 anak-anak tiap sore. Saat salat Jumat, jamaah mencapai 120 orang hingga ke serambi luar.

Rencana renovasi meliputi pembongkaran asbes lama, penggantian rangka dengan baja ringan, dan pemasangan genteng metal berpasir agar lebih tahan cuaca. Seluruh anggaran dan bukti pembelian material akan dicatat terbuka di buku kas ini.`,
      targetAmount: 85000000n,
      basis: 'BERIZIN',
      permitNumber: '188/412/415.35/2026',
      permitDate: new Date('2026-10-12T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });

  // Bersihkan entri lama jika seeding ulang
  await prisma.ledgerEntry.deleteMany({
    where: { campaignId: campaign.id },
  });

  // 3. 11 Entri Ledger Sesuai Spesifikasi Design.md Bagian 8
  const rawEntriesData = [
    {
      seq: 1,
      type: 'IN' as const,
      source: 'MANUAL' as const,
      amount: 10000000n,
      fee: 0n,
      description: 'Saldo awal dari kas takmir',
      occurredAt: '2026-10-22T08:00:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 2,
      type: 'IN' as const,
      source: 'MANUAL' as const,
      amount: 5000000n,
      fee: 0n,
      donorName: 'Bpk. Sholeh',
      description: 'Donasi tunai dari Bpk. Sholeh',
      occurredAt: '2026-10-22T14:30:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 3,
      type: 'IN' as const,
      source: 'MIDTRANS' as const,
      amount: 100000n,
      fee: 700n,
      feeSource: 'MIDTRANS_OFFICIAL_TABLE',
      paymentType: 'qris',
      donorName: 'Dina K.',
      message: 'Semoga atapnya segera selesai, Pak.',
      occurredAt: '2026-10-23T09:15:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 4,
      type: 'IN' as const,
      source: 'MIDTRANS' as const,
      amount: 250000n,
      fee: 1750n,
      feeSource: 'MIDTRANS_OFFICIAL_TABLE',
      paymentType: 'gopay',
      donorName: 'Anonim',
      isAnonymous: true,
      occurredAt: '2026-10-24T11:20:00.000Z',
    },
    {
      seq: 5,
      type: 'IN' as const,
      source: 'MIDTRANS' as const,
      amount: 2000000n,
      fee: 14000n,
      feeSource: 'MIDTRANS_OFFICIAL_TABLE',
      paymentType: 'bank_transfer',
      donorName: 'Keluarga Besar H. Mansur',
      occurredAt: '2026-10-24T16:45:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 6,
      type: 'OUT' as const,
      source: 'MANUAL' as const,
      amount: 6350000n,
      fee: 0n,
      description: 'Semen 40 sak dan pasir 2 rit, Toko Bangunan Makmur',
      proofUrl: '/api/proof/placeholder-semen',
      occurredAt: '2026-10-25T10:00:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 7,
      type: 'IN' as const,
      source: 'MIDTRANS' as const,
      amount: 500000n,
      fee: 3500n,
      feeSource: 'MIDTRANS_OFFICIAL_TABLE',
      paymentType: 'qris',
      donorName: 'Rizal (Surabaya)',
      message: 'Semoga cepat selesai, nitip salam buat warga.',
      occurredAt: '2026-10-25T13:40:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 8,
      type: 'OUT' as const,
      source: 'MANUAL' as const,
      amount: 4500000n,
      fee: 0n,
      description: 'Upah tukang 5 orang x 3 hari',
      occurredAt: '2026-10-26T09:00:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 9,
      type: 'IN' as const,
      source: 'MANUAL' as const,
      amount: 1275000n,
      fee: 0n,
      description: 'Kotak amal Jumat',
      occurredAt: '2026-10-26T13:00:00.000Z',
      isAnonymous: false,
    },
    {
      seq: 10,
      type: 'REVERSAL' as const,
      source: 'MANUAL' as const,
      amount: 4500000n,
      fee: 0n,
      description: 'Membatalkan #8: nominal salah, seharusnya 4.800.000',
      occurredAt: '2026-10-27T08:30:00.000Z',
      isAnonymous: false,
      reversesSeq: 8,
    },
    {
      seq: 11,
      type: 'OUT' as const,
      source: 'MANUAL' as const,
      amount: 4800000n,
      fee: 0n,
      description: 'Upah tukang 5 orang x 3 hari (koreksi dari #8)',
      proofUrl: '/api/proof/placeholder-upah',
      occurredAt: '2026-10-27T09:00:00.000Z',
      isAnonymous: false,
    },
  ];

  let prevHash = GENESIS_PREV_HASH;
  const createdEntries: { id: string; seq: number; hash: string }[] = [];

  for (const item of rawEntriesData) {
    let reversesEntryId: string | null = null;
    if (item.type === 'REVERSAL' && 'reversesSeq' in item) {
      const target = createdEntries.find((e) => e.seq === item.reversesSeq);
      if (target) {
        reversesEntryId = target.id;
      }
    }

    const payload: LedgerEntryPayload = {
      campaignId: campaign.id,
      seq: item.seq,
      type: item.type,
      source: item.source,
      amount: item.amount,
      fee: item.fee,
      feeSource: (item as { feeSource?: string }).feeSource ?? null,
      paymentType: (item as { paymentType?: string }).paymentType ?? null,
      occurredAt: item.occurredAt,
      donorName: (item as { donorName?: string }).donorName ?? null,
      isAnonymous: item.isAnonymous,
      message: (item as { message?: string }).message ?? null,
      description: item.description ?? null,
      proofUrl: (item as { proofUrl?: string }).proofUrl ?? null,
      reversesEntryId,
    };

    const hash = computeEntryHash(prevHash, payload);

    const created = await prisma.ledgerEntry.create({
      data: {
        campaignId: campaign.id,
        seq: item.seq,
        type: item.type,
        source: item.source,
        amount: item.amount,
        fee: item.fee,
        feeSource: payload.feeSource,
        paymentType: payload.paymentType,
        occurredAt: new Date(item.occurredAt),
        donorName: payload.donorName,
        isAnonymous: payload.isAnonymous,
        message: payload.message,
        description: payload.description,
        proofUrl: payload.proofUrl,
        reversesEntryId,
        createdById: admin.id,
        prevHash,
        hash,
      },
    });

    createdEntries.push({ id: created.id, seq: created.seq, hash: created.hash });
    prevHash = hash;
  }

  // Verifikasi keutuhan rantai hasil seed
  const allDbEntries = await prisma.ledgerEntry.findMany({
    where: { campaignId: campaign.id },
    orderBy: { seq: 'asc' },
  });

  const verification = verifyLedgerIntegrity(
    allDbEntries.map((e) => ({
      id: e.id,
      campaignId: e.campaignId,
      seq: e.seq,
      type: e.type,
      source: e.source,
      amount: e.amount,
      fee: e.fee,
      feeSource: e.feeSource,
      paymentType: e.paymentType,
      donationId: e.donationId,
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

  console.log('Hasil Verifikasi Seed:', {
    totalEntries: verification.totalEntries,
    isValid: verification.isValid,
    lastHash: verification.lastHash?.substring(0, 12),
  });

  if (!verification.isValid) {
    throw new Error('Seed data menghasilkan rantai ledger yang tidak valid!');
  }

  console.log('Seeding selesai dengan sukses! Campaign: /c/atap-musala-al-ikhlas');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
