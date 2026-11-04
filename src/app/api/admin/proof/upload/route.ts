import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { validateProofMagicBytes } from '@/lib/storage/proof';
import { getProofStorage } from '@/lib/storage/adapter';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const POST = withAdminAuth(async (req) => {
  try {
    // Rate Limiter per IP (PRD 4.6: maks 10 upload bukti per menit)
    const clientIp = getClientIp(req);
    const rateLimit = await checkRateLimit({
      key: `upload:${clientIp}`,
      limit: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Terlalu banyak permintaan unggah bukti. Silakan coba sesaat lagi.' },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: 'File bukti foto wajib dilampirkan.' },
        { status: 422 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validasi Magic Bytes di server (US-3)
    const validation = validateProofMagicBytes(buffer);

    if (!validation.isValid || !validation.extension || !validation.proofSha256) {
      return NextResponse.json(
        { error: 'Unprocessable Entity', message: validation.error || 'File tidak valid.' },
        { status: 422 }
      );
    }

    // Simpan file ke storage adapter (Object Storage di production, lokal di dev)
    const storage = getProofStorage();
    const proofUrl = await storage.save(
      buffer,
      validation.proofSha256,
      validation.extension,
      validation.mimeType
    );

    return NextResponse.json({
      message: 'Foto bukti berhasil diunggah',
      data: {
        proofUrl,
        proofSha256: validation.proofSha256,
        mimeType: validation.mimeType,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan unggah';
    return NextResponse.json({ error: 'Internal Server Error', message: errorMsg }, { status: 500 });
  }
});
