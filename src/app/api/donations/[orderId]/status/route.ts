import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: Request,
  props: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await props.params;

  // Endpoint publik hanya mengembalikan status transaksi (PRD 4.5).
  // Nama donatur dan pesan tidak pernah dimasukkan ke respons publik ini.
  const donation = await prisma.donation.findUnique({
    where: { orderId },
    select: {
      orderId: true,
      status: true,
      paidAt: true,
    },
  });

  if (!donation) {
    return NextResponse.json({ error: 'Donasi tidak ditemukan.' }, { status: 404 });
  }

  return NextResponse.json({
    orderId: donation.orderId,
    status: donation.status,
    paidAt: donation.paidAt,
  });
}

