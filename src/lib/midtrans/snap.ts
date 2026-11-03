/**
 * Midtrans Snap Client (Tangga Malas: Bawaan Node.js fetch & Buffer)
 * Server Key HANYA dibaca di server (PRD Bagian 10).
 */

export interface CreateSnapTransactionParams {
  orderId: string;
  amount: number;
  donorName?: string | null;
  isAnonymous?: boolean;
  doa?: string | null;
}

export interface SnapTransactionResult {
  token: string;
  redirectUrl: string;
}

export async function createSnapTransaction(
  params: CreateSnapTransactionParams
): Promise<SnapTransactionResult> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error('MIDTRANS_SERVER_KEY tidak ditemukan di environment variables.');
  }

  // Khusus mode mock pengujian unit atau offline
  if (process.env.MIDTRANS_MOCK === 'true' || serverKey === 'SB-Mid-server-test-placeholder') {
    return {
      token: `mock-snap-token-${params.orderId}`,
      redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/mock-snap-token-${params.orderId}`,
    };
  }

  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const endpoint = isProduction
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

  const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;

  const payload = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.amount,
    },
    customer_details: {
      first_name: params.isAnonymous
        ? 'Donatur Anonim'
        : params.donorName?.trim() || 'Donatur',
      notes: params.doa ? params.doa.trim().slice(0, 200) : undefined,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Midtrans Snap API Error [${response.status}]: ${errorText}`);
  }

  const data = (await response.json()) as { token: string; redirect_url: string };

  return {
    token: data.token,
    redirectUrl: data.redirect_url,
  };
}

