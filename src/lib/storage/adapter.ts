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
  async save(buffer: Buffer, hash: string, extension: string): Promise<string> {
    const dir = path.join(process.cwd(), 'public', 'uploads', 'proofs');
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(process.cwd(), 'public', 'uploads', 'proofs', `${hash}.${extension}`);
    await fs.writeFile(fullPath, buffer);
    return `/api/proof/${hash}`;
  }

  async get(hash: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    for (const ext of ['jpg', 'png', 'webp', 'jpeg']) {
      const candidate = path.join(process.cwd(), 'public', 'uploads', 'proofs', `${hash}.${ext}`);
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
 * Adapter Supabase Storage (REST API bawaan fetch dengan service-role key — hanya di sisi server)
 * Sesuai Aturan 8.5 L: Satu implementasi object storage standar tanpa SDK berat.
 */
export class SupabaseStorageAdapter implements ProofStorage {
  private endpoint: string;
  private bucket: string;
  private serviceRoleKey: string;

  constructor() {
    this.endpoint = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'kasbuka-proofs';
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!this.endpoint || !this.serviceRoleKey) {
      throw new Error(
        'Konfigurasi Supabase Storage belum lengkap: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.'
      );
    }
  }

  async save(buffer: Buffer, hash: string, extension: string, mimeType: string): Promise<string> {
    const objectKey = `${hash}.${extension}`;
    const url = `${this.endpoint}/storage/v1/object/${this.bucket}/${objectKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(buffer),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal mengunggah ke Supabase Storage: ${res.status} ${errText}`);
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
            Authorization: `Bearer ${this.serviceRoleKey}`,
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
        // Coba ekstensi lain jika kandidat ini gagal
      }
    }
    return null;
  }
}

/**
 * Pabrik adapter storage (Aturan 8.5 L):
 * STORAGE_PROVIDER=local di production harus melempar error saat start/init.
 */
export function getProofStorage(): ProofStorage {
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';

  if (provider === 'local') {
    if (isProd) {
      throw new Error('STORAGE_PROVIDER=local dilarang di lingkungan production. Gunakan Supabase Storage.');
    }
    return new LocalDiskStorage();
  }

  if (provider === 'supabase') {
    return new SupabaseStorageAdapter();
  }

  if (isProd) {
    throw new Error(`STORAGE_PROVIDER '${provider}' tidak dikenal untuk production.`);
  }

  return new LocalDiskStorage();
}
