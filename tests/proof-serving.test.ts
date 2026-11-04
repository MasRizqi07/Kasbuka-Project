import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GET as getProof } from '@/app/api/proof/[hash]/route';

describe('Proof Serving Endpoint /api/proof/[hash] (Aturan 8.2 E)', () => {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'proofs');
  const validHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const testFilePath = path.join(uploadDir, `${validHash}.jpg`);

  // Valid JPEG header magic bytes: FF D8 FF E0
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  beforeAll(async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(testFilePath, validJpegBuffer);
  });

  afterAll(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // ignore
    }
  });

  it('menolak path traversal dengan status 400', async () => {
    const traversals = [
      '../etc/passwd',
      '../../secret',
      '..%2F..%2Fetc%2Fpasswd',
      '..\\..\\windows\\system32',
    ];

    for (const badHash of traversals) {
      const req = new Request(`http://localhost:3000/api/proof/${badHash}`);
      const res = await getProof(req, { params: Promise.resolve({ hash: badHash }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Format hash bukti tidak valid.');
    }
  });

  it('menolak hash dengan panjang yang salah (< 64 atau > 64) dengan status 400', async () => {
    const wrongLengths = [
      'abc',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85', // 63 chars
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855a', // 65 chars
    ];

    for (const badHash of wrongLengths) {
      const req = new Request(`http://localhost:3000/api/proof/${badHash}`);
      const res = await getProof(req, { params: Promise.resolve({ hash: badHash }) });
      expect(res.status).toBe(400);
    }
  });

  it('menolak karakter non-heksadesimal dengan status 400', async () => {
    const nonHex = 'g'.repeat(64);
    const req = new Request(`http://localhost:3000/api/proof/${nonHex}`);
    const res = await getProof(req, { params: Promise.resolve({ hash: nonHex }) });
    expect(res.status).toBe(400);
  });

  it('mengembalikan status 404 jika file bukti tidak ditemukan di storage', async () => {
    const notFoundHash = '0'.repeat(64);
    const req = new Request(`http://localhost:3000/api/proof/${notFoundHash}`);
    const res = await getProof(req, { params: Promise.resolve({ hash: notFoundHash }) });
    expect(res.status).toBe(404);
  });

  it('menyajikan file bukti valid dengan header keamanan nosniff dan Cache-Control immutable', async () => {
    const req = new Request(`http://localhost:3000/api/proof/${validHash}`);
    const res = await getProof(req, { params: Promise.resolve({ hash: validHash }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });
});
