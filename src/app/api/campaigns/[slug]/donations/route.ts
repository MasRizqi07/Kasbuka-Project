import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { createSnapTransaction } from '@/lib/midtrans/snap';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const DonationRequestSchema = z.object({
  amount: z
    .number()
    .int('Nominal harus bilangan bulat.')
    .min(10_000, 'Nominal donasi minimal Rp 10.000.')
    .max(100_000_000, 'Nominal donasi maksimal Rp 100.000.000.'),
  donorName: z.string().max(60, 'Nama donatur maksimal 60 karakter.').optional().nullable(),
  isAnonymous: z.boolean().optional().default(false),
  doa: z.string().max(200, 'Pesan doa maksimal 200 karakter.').optional().nullable(),
  message: z.string().max(200, 'Pesan doa maksimal 200 karakter.').optional().nullable(),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params;

  // 0. Guard Keputusan D1: Jika donasi online dinonaktifkan di production pilot
  if (process.env.DONATIONS_ENABLED === 'false') {
    return NextResponse.json(
      { error: 'Donasi online belum aktif. Hubungi pengurus.' },
      { status: 403 }
    );
  }

  // 1. Rate Limiter per IP (PRD 4.6: maks 20 pembuatan donasi per menit)
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit({
    key: `donation:${clientIp}`,
    limit: 20,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan donasi. Silakan coba sesaat lagi.' },
      { status: 429 }
    );
  }

  // 2. Parse & Validasi Body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON tidak valid.' }, { status: 400 });
  }

  const parsed = DonationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { amount, donorName, isAnonymous } = parsed.data;
  const doa = (parsed.data.doa ?? parsed.data.message ?? null)?.trim() || null;

  // 3. Cari Campaign
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign tidak ditemukan.' }, { status: 404 });
  }

  // 4. Validasi Status Campaign (PRD 4.2 & US-7)
  if (campaign.status === 'CLOSED') {
    return NextResponse.json(
      { error: 'Campaign sudah ditutup untuk donasi baru.' },
      { status: 409 }
    );
  }

  if (campaign.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'Campaign belum aktif untuk menerima donasi.' },
      { status: 404 }
    );
  }

  // 5. Generate orderId unik format KSB-[uuid tanpa strip] (di bawah 50 karakter)
  const cleanUuid = randomUUID().replace(/-/g, '');
  const orderId = `KSB-${cleanUuid}`;

  try {
    // 6. Buat rekaman donasi PENDING di database
    const donation = await prisma.donation.create({
      data: {
        campaignId: campaign.id,
        orderId,
        amount: BigInt(amount),
        donorName: isAnonymous ? null : (donorName?.trim() || null),
        isAnonymous: Boolean(isAnonymous),
        message: doa,
        status: 'PENDING',
      },
    });

    // 7. Panggil Midtrans Snap Transactions API dari server
    const snapResult = await createSnapTransaction({
      orderId,
      amount,
      donorName: isAnonymous ? null : (donorName?.trim() || null),
      isAnonymous: Boolean(isAnonymous),
      doa,
    });

    // Simpan snapToken yang dikembalikan
    await prisma.donation.update({
      where: { id: donation.id },
      data: { snapToken: snapResult.token },
    });

    return NextResponse.json(
      {
        token: snapResult.token,
        orderId,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal membuat transaksi donasi.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

