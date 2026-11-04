import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdminAuth } from '@/lib/auth-guard';

export const GET = withAdminAuth(async (_req, session) => {
  try {
    // 1. Ambil seluruh WebhookEvent dengan status ANOMALY (PRD 4.3 & Aturan 8.5 K)
    const anomalyEvents = await prisma.webhookEvent.findMany({
      where: {
        result: 'ANOMALY',
      },
      orderBy: {
        receivedAt: 'desc',
      },
      take: 100,
    });

    if (anomalyEvents.length === 0) {
      return NextResponse.json({
        count: 0,
        anomalies: [],
      });
    }

    // 2. Filter per organisasi pengurus yang sedang login (Multi-tenant isolation)
    const orderIds = anomalyEvents.map((e) => e.orderId);
    const relatedDonations = await prisma.donation.findMany({
      where: {
        orderId: { in: orderIds },
        campaign: {
          organizationId: session.user.organizationId,
        },
      },
      include: {
        campaign: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    });

    const donationMap = new Map(relatedDonations.map((d) => [d.orderId, d]));

    // Hanya tampilkan anomali milik organisasi admin yang sedang login
    const orgAnomalies = anomalyEvents
      .filter((e) => donationMap.has(e.orderId))
      .map((e) => {
        const d = donationMap.get(e.orderId)!;
        return {
          id: e.id,
          orderId: e.orderId,
          transactionStatus: e.transactionStatus,
          result: e.result,
          receivedAt: e.receivedAt.toISOString(),
          amount: d.amount.toString(),
          campaignTitle: d.campaign.title,
          campaignSlug: d.campaign.slug,
        };
      });

    return NextResponse.json({
      count: orgAnomalies.length,
      anomalies: orgAnomalies,
    });
  } catch (error) {
    console.error('Gagal mengambil daftar anomali webhook:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem saat mengambil data anomali.' },
      { status: 500 }
    );
  }
});
