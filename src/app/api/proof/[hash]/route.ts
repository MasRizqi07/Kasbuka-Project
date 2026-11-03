import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProofMagicBytes } from '@/lib/storage/proof';

export async function GET(
  _request: Request,
  props: { params: Promise<{ hash: string }> }
) {
  const { hash } = await props.params;

  // Sanitasi hash: hanya karakter heksadesimal 64 karakter SHA-256 (mencegah path traversal)
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return NextResponse.json({ error: 'Format hash bukti tidak valid.' }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'proofs');

  let foundFile: string | null = null;
  for (const ext of ['jpg', 'png', 'webp', 'jpeg']) {
    const candidate = path.join(uploadDir, `${hash}.${ext}`);
    try {
      await fs.access(candidate);
      foundFile = candidate;
      break;
    } catch {
      // Cari ekstensi lainnya
    }
  }

  if (!foundFile) {
    return NextResponse.json({ error: 'File bukti nota tidak ditemukan.' }, { status: 404 });
  }

  const fileBuffer = await fs.readFile(foundFile);

  // PRD 5.2: Content-Type hasil sniff magic bytes nyata, bukan dari input klien
  const validation = validateProofMagicBytes(fileBuffer);
  if (!validation.isValid || !validation.mimeType) {
    return NextResponse.json({ error: 'File bukti korup atau tidak valid.' }, { status: 415 });
  }

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': validation.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

