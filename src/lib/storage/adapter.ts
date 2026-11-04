import fs from 'node:fs/promises';
import path from 'node:path';
import { validateProofMagicBytes } from './proof';

export interface ProofStorage {
  save(buffer: Buffer, hash: string, extension: string, mimeType: string): Promise<string>;
  get(hash: string): Promise<{ buffer: Buffer; mimeType: string } | null>;
}

/**
 * Adapter Filesystem Lokal (hanya untuk development & testing lokal)
 */
export class LocalDiskStorage implements ProofStorage {
  private uploadDir = path.join(process.cwd(), 'public', 'uploads', 'proofs');

  async save(buffer: Buffer, hash: string, extension: string): Promise<string> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    const fullPath = path.join(this.uploadDir, `${hash}.${extension}`);
    await fs.writeFile(fullPath, buffer);
    return `/api/proof/${hash}`;
  }

  async get(hash: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    for (const ext of ['jpg', 'png', 'webp', 'jpeg']) {
      const candidate = path.join(this.uploadDir, `${hash}.${ext}`);
      try {
        await fs.access(candidate);
        const fileBuffer = await fs.readFile(candidate);
        const validation = validateProofMagicBytes(fileBuffer);
        if (validation.isValid && validation.mimeType) {
          return { buffer: fileBuffer, mimeType: validation.mimeType };
        }
      } catch {
        // Coba ekstensi lain
      }
    }
    return null;
  }
}

/**
 * Adapter Object Storage (R2 / Supabase Storage via REST API bawaan fetch tanpa SDK pihak ketiga)
 */
export class ObjectStorageAdapter implements ProofStorage {
  private endpoint: string;
  private bucket: string;
  private apiKey: string;

  constructor() {
    this.endpoint = (process.env.STORAGE_ENDPOINT || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.bucket = process.env.STORAGE_BUCKET || 'kasbuka-proofs';
    this.apiKey = process.env.STORAGE_ACCESS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  }

  async save(buffer: Buffer, hash: string, extension: string, mimeType: string): Promise<string> {
    const objectKey = `${hash}.${extension}`;
    const url = `${this.endpoint}/storage/v1/object/${this.bucket}/${objectKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: buffer as unknown as BodyInit,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal mengunggah ke Object Storage: ${res.status} ${errText}`);
    }

    return `/api/proof/${hash}`;
  }

  async get(hash: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    for (const ext of ['jpg', 'png', 'webp', 'jpeg']) {
      const objectKey = `${hash}.${ext}`;
      const url = `${this.endpoint}/storage/v1/object/authenticated/${this.bucket}/${objectKey}`;

      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        });

        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuf);
          const validation = validateProofMagicBytes(fileBuffer);
          if (validation.isValid && validation.mimeType) {
            return { buffer: fileBuffer, mimeType: validation.mimeType };
          }
        }
      } catch {
        // Coba ekstensi lain
      }
    }
    return null;
  }
}

/**
 * Pabrik adapter storage: Menggunakan Object Storage jika endpoint disetel (atau di production),
 * fallback ke filesystem lokal di lingkungan development.
 */
export function getProofStorage(): ProofStorage {
  const isObjectStorageConfigured = Boolean(
    process.env.STORAGE_ENDPOINT || process.env.SUPABASE_URL
  );

  if (isObjectStorageConfigured) {
    return new ObjectStorageAdapter();
  }

  return new LocalDiskStorage();
}
