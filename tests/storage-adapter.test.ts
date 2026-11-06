import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseStorageAdapter, getProofStorage, LocalDiskStorage } from '@/lib/storage/adapter';

// Dummy 1x1 valid PNG (Magic bytes 89 50 4E 47 0D 0A 1A 0A)
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('Supabase Storage Adapter (Aturan 8.5 L)', () => {
  const originalEnv = { ...process.env };
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-service-role-key-xyz';
    process.env.SUPABASE_STORAGE_BUCKET = 'kasbuka-proofs';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  it('1. save() mengunggah buffer ke endpoint Supabase Storage REST dengan kunci hash murni tanpa ekstensi (Aturan 5B V)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ Key: 'kasbuka-proofs/abc123hash' }),
    });

    const adapter = new SupabaseStorageAdapter();
    const resultUrl = await adapter.save(VALID_PNG_BUFFER, 'abc123hash', 'png', 'image/png');

    expect(resultUrl).toBe('/api/proof/abc123hash');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://mock-project.supabase.co/storage/v1/object/kasbuka-proofs/abc123hash');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers).toMatchObject({
      Authorization: 'Bearer secret-service-role-key-xyz',
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    });
  });

  it('2. get() berhasil mengunduh file dalam satu HTTP request dan memvalidasi magic bytes saat status 200 (Aturan 5B V)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        VALID_PNG_BUFFER.buffer.slice(
          VALID_PNG_BUFFER.byteOffset,
          VALID_PNG_BUFFER.byteOffset + VALID_PNG_BUFFER.byteLength
        ),
    });

    const adapter = new SupabaseStorageAdapter();
    const file = await adapter.get('abc123hash');

    expect(file).not.toBeNull();
    expect(file?.mimeType).toBe('image/png');
    expect(file?.buffer).toBeDefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://mock-project.supabase.co/storage/v1/object/authenticated/kasbuka-proofs/abc123hash');
    expect(calledOptions.headers).toMatchObject({
      Authorization: 'Bearer secret-service-role-key-xyz',
    });
  });

  it('3. get() mengembalikan null tepat dalam satu HTTP request saat objek tidak ditemukan (404) (Aturan 5B V)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const adapter = new SupabaseStorageAdapter();
    const file = await adapter.get('notfoundhash');

    expect(file).toBeNull();
    // Tepat 1 kali panggilan tanpa menebak-nebak ekstensi (Aturan 5B V)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('4. getProofStorage() melempar error keras jika STORAGE_PROVIDER=local di lingkungan production', () => {
    Object.assign(process.env, { NODE_ENV: 'production', STORAGE_PROVIDER: 'local' });

    expect(() => getProofStorage()).toThrow('STORAGE_PROVIDER=local dilarang di lingkungan production');
  });

  it('5. getProofStorage() mengembalikan SupabaseStorageAdapter jika STORAGE_PROVIDER=supabase', () => {
    process.env.STORAGE_PROVIDER = 'supabase';
    const storage = getProofStorage();
    expect(storage).toBeInstanceOf(SupabaseStorageAdapter);
  });

  it('6. getProofStorage() mengembalikan LocalDiskStorage di lingkungan development/test', () => {
    Object.assign(process.env, { NODE_ENV: 'test', STORAGE_PROVIDER: 'local' });
    const storage = getProofStorage();
    expect(storage).toBeInstanceOf(LocalDiskStorage);
  });

  it('7. getProofStorage() mengabaikan E2E_TEST jika berada di lingkungan Vercel (Aturan 5B T)', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      STORAGE_PROVIDER: 'local',
      E2E_TEST: 'true',
      VERCEL: '1',
    });

    expect(() => getProofStorage()).toThrow('STORAGE_PROVIDER=local dilarang di lingkungan production');
  });

  it('8. getProofStorage() mengizinkan E2E_TEST hanya di luar Vercel (misal local e2e runner)', () => {
    delete process.env.VERCEL;
    Object.assign(process.env, {
      NODE_ENV: 'production',
      STORAGE_PROVIDER: 'local',
      E2E_TEST: 'true',
    });

    const storage = getProofStorage();
    expect(storage).toBeInstanceOf(LocalDiskStorage);
  });
});
