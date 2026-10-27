import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (PRD US-3 & Bagian 10)

export type AllowedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ProofValidationResult {
  isValid: boolean;
  mimeType?: AllowedMimeType;
  extension?: string;
  proofSha256?: string;
  error?: string;
}

/**
 * Validasi Magic Bytes di server (PRD US-3):
 * Validasi dilakukan berdasarkan signature byte awal file, bukan ekstensi nama file.
 * JPEG: FF D8 FF
 * PNG: 89 50 4E 47 0D 0A 1A 0A
 * WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
 */
export function validateProofMagicBytes(buffer: Buffer): ProofValidationResult {
  if (buffer.length === 0) {
    return { isValid: false, error: 'File kosong.' };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { isValid: false, error: 'Ukuran file bukti melebihi batas maksimum 5 MB.' };
  }

  // Hitung proofSha256
  const proofSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Periksa JPEG (FF D8 FF)
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      isValid: true,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      proofSha256,
    };
  }

  // Periksa PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      isValid: true,
      mimeType: 'image/png',
      extension: 'png',
      proofSha256,
    };
  }

  // Periksa WebP (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return {
      isValid: true,
      mimeType: 'image/webp',
      extension: 'webp',
      proofSha256,
    };
  }

  return {
    isValid: false,
    error: 'Format file tidak didukung. Bukti foto wajib berupa JPEG, PNG, atau WebP.',
  };
}

/**
 * Menyimpan file bukti ke folder publik dengan nama acak UUID
 * (PRD Bagian 10: nama file diganti UUID)
 */
export async function saveProofFileLocally(buffer: Buffer, extension: string): Promise<string> {
  const fileUuid = crypto.randomUUID();
  const fileName = `${fileUuid}.${extension}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'proofs');

  await fs.mkdir(uploadDir, { recursive: true });
  const fullPath = path.join(uploadDir, fileName);
  await fs.writeFile(fullPath, buffer);

  return `/uploads/proofs/${fileName}`;
}
