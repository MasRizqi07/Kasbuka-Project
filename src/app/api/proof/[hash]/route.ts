import { NextResponse } from 'next/server';
import { getProofStorage } from '@/lib/storage/adapter';

export async function GET(
  _request: Request,
  props: { params: Promise<{ hash: string }> }
) {
  const { hash } = await props.params;

  // Validasi ketat format hash SHA-256 sebelum menyentuh storage (Aturan 8.2 E)
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: 'Format hash bukti tidak valid.' }, { status: 400 });
  }

  const storage = getProofStorage();
  const file = await storage.get(hash);

  if (!file) {
    return NextResponse.json({ error: 'File bukti nota tidak ditemukan.' }, { status: 404 });
  }

  return new NextResponse(file.buffer, {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

