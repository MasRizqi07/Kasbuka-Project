import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth-guard';
import { validateProofMagicBytes, saveProofFileLocally } from '@/lib/storage/proof';

export const POST = withAdminAuth(async (req) => {
  try {
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

    // Simpan file dengan nama UUID
    const proofUrl = await saveProofFileLocally(buffer, validation.extension);

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
