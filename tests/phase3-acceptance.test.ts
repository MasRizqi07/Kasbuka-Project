import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateProofMagicBytes } from '@/lib/storage/proof';
import { POST as createCampaign } from '@/app/api/admin/campaigns/route';
import { PATCH as publishCampaign } from '@/app/api/admin/campaigns/[id]/publish/route';
import { PATCH as closeCampaign } from '@/app/api/admin/campaigns/[id]/close/route';
import { POST as recordExpense } from '@/app/api/admin/entries/expense/route';
import { POST as recordManualIncome } from '@/app/api/admin/entries/manual-income/route';
import { GET as getPublicCampaign } from '@/app/api/campaigns/[slug]/route';
import { POST as uploadProof } from '@/app/api/admin/proof/upload/route';
import { prisma } from '@/lib/prisma';
import type { AdminSession } from '@/lib/auth';

// Mock sesi admin terautentikasi
let currentMockSession: AdminSession | null = null;

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve(currentMockSession)),
}));

// Mock Prisma untuk pengujian isolasi API
vi.mock('@/lib/prisma', () => {
  const mockOrg = { id: 'org-al-ikhlas', name: 'Takmir Musala Al-Ikhlas' };
  const mockOtherOrg = { id: 'org-lain', name: 'Yayasan Lain' };

  let campaignsStore: any[] = [];
  let entriesStore: any[] = [];

  return {
    prisma: {
      organization: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id === mockOrg.id) return mockOrg;
          return null;
        }),
      },
      campaign: {
        findFirst: vi.fn(async ({ where }: any) => {
          return campaignsStore.find((c) => {
            const matchId = !where.id || c.id === where.id;
            const matchOrg = !where.organizationId || c.organizationId === where.organizationId;
            return matchId && matchOrg;
          }) || null;
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          const camp = campaignsStore.find((c) => c.slug === where.slug || c.id === where.id);
          if (!camp) return null;
          return {
            ...camp,
            organization: mockOrg,
            ledgerEntries: entriesStore.filter((e) => e.campaignId === camp.id),
          };
        }),
        create: vi.fn(async ({ data }: any) => {
          const newCamp = { id: `camp-${Date.now()}`, ...data, createdAt: new Date() };
          campaignsStore.push(newCamp);
          return newCamp;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const idx = campaignsStore.findIndex((c) => c.id === where.id);
          if (idx !== -1) {
            campaignsStore[idx] = { ...campaignsStore[idx], ...data };
            return campaignsStore[idx];
          }
          throw new Error('Not found');
        }),
      },
      ledgerEntry: {
        findMany: vi.fn(async ({ where, orderBy, take }: any) => {
          let filtered = entriesStore.filter((e) => e.campaignId === where.campaignId);
          if (where.seq?.lt) {
            filtered = filtered.filter((e) => e.seq < where.seq.lt);
          }
          if (orderBy?.seq === 'desc') {
            filtered.sort((a, b) => b.seq - a.seq);
          } else {
            filtered.sort((a, b) => a.seq - b.seq);
          }
          if (take) {
            return filtered.slice(0, take);
          }
          return filtered;
        }),
        findFirst: vi.fn(async ({ where, orderBy }: any) => {
          const filtered = entriesStore.filter((e) => e.campaignId === where.campaignId);
          if (orderBy?.seq === 'desc') {
            filtered.sort((a, b) => b.seq - a.seq);
          }
          return filtered[0] || null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const newEntry = { id: `entry-${Date.now()}`, ...data };
          entriesStore.push(newEntry);
          return newEntry;
        }),
      },
      $transaction: vi.fn(async (cb: any) => {
        return cb(prisma);
      }),
      _resetStore: () => {
        campaignsStore = [];
        entriesStore = [];
      },
      _seedStore: (c: any[], e: any[]) => {
        campaignsStore = c;
        entriesStore = e;
      },
    },
  };
});

describe('Fase 3 Evidence Gate: Akseptansi US-1, US-3, US-4, dan US-7', () => {
  beforeEach(() => {
    (prisma as any)._resetStore();
    currentMockSession = {
      user: {
        id: 'usr-hasan',
        email: 'hasan@karangpoh.org',
        name: 'Pak Hasan',
        role: 'ORG_ADMIN',
        organizationId: 'org-al-ikhlas',
      },
      organization: {
        id: 'org-al-ikhlas',
        name: 'Takmir Musala Al-Ikhlas',
      },
    };
  });

  describe('US-7: Pengurus Membuat dan Mengelola Siklus Hidup Campaign (P0)', () => {
    it('pengurus dapat membuat campaign baru dan status otomatis tersimpan DRAFT', async () => {
      const req = new Request('http://localhost:3000/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Renovasi Atap Musala',
          story: 'Atap musala bocor dan butuh perbaikan rangka.',
          targetAmount: '85000000',
          basis: 'TERBATAS',
        }),
      });

      const res = await createCampaign(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.status).toBe('DRAFT');
      expect(json.data.slug).toBe('renovasi-atap-musala');
    });

    it('dasar penggalangan BERIZIN tanpa nomor izin wajib ditolak HTTP 422', async () => {
      const req = new Request('http://localhost:3000/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Galang Dana Warga',
          story: 'Cerita donasi umum.',
          basis: 'BERIZIN', // Tanpa permitNumber
        }),
      });

      const res = await createCampaign(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.message).toContain('Nomor izin wajib diisi');
    });

    it('pengurus mempublikasikan campaign DRAFT menjadi status ACTIVE', async () => {
      (prisma as any)._seedStore(
        [
          {
            id: 'camp-01',
            organizationId: 'org-al-ikhlas',
            slug: 'musala-01',
            title: 'Musala Al-Ikhlas',
            status: 'DRAFT',
          },
        ],
        []
      );

      const res = await publishCampaign(new Request('http://localhost:3000'), {
        params: Promise.resolve({ id: 'camp-01' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('ACTIVE');
    });

    it('pengurus menutup campaign ACTIVE menjadi status CLOSED', async () => {
      (prisma as any)._seedStore(
        [
          {
            id: 'camp-01',
            organizationId: 'org-al-ikhlas',
            slug: 'musala-01',
            title: 'Musala Al-Ikhlas',
            status: 'ACTIVE',
          },
        ],
        []
      );

      const res = await closeCampaign(new Request('http://localhost:3000'), {
        params: Promise.resolve({ id: 'camp-01' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('CLOSED');
      expect(json.message).toContain('Donasi baru ditolak');
    });
  });

  describe('US-3: Pengurus Mencatat Pengeluaran dengan Bukti (P0)', () => {
    it('validasi Magic Bytes di server: mendeteksi JPEG, PNG, WebP sah dan menolak format palsu', () => {
      // JPEG sah: FF D8 FF
      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(validateProofMagicBytes(validJpeg).isValid).toBe(true);
      expect(validateProofMagicBytes(validJpeg).mimeType).toBe('image/jpeg');

      // PNG sah: 89 50 4E 47 0D 0A 1A 0A
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(validateProofMagicBytes(validPng).isValid).toBe(true);

      // WebP sah: RIFF (52 49 46 46) + WEBP (57 45 42 50)
      const validWebP = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      expect(validateProofMagicBytes(validWebP).isValid).toBe(true);
      expect(validateProofMagicBytes(validWebP).mimeType).toBe('image/webp');
    });

    it('menolak biner file executable Windows (.exe dengan header PE/MZ) yang dinamai berkas.jpg', () => {
      // Header biner executable PE/DOS: MZ (4D 5A) + DOS stub
      const dosStubText = 'This program cannot be run in DOS mode.';
      const fakeExeBuffer = Buffer.concat([
        Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff]),
        Buffer.from(dosStubText, 'utf8'),
      ]);

      const result = validateProofMagicBytes(fakeExeBuffer);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Format file tidak didukung');
    });

    it('menolak payload skrip teks HTML/SVG berbahaya (<script>alert(1)</script>) yang dinamai nota.png', () => {
      const maliciousScript = Buffer.from('<script>alert("xss")</script><svg onload=alert(1)>', 'utf8');
      const result = validateProofMagicBytes(maliciousScript);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Format file tidak didukung');
    });

    it('menolak file yang ukurannya melebihi batas 5 MB (5 * 1024 * 1024 + 1)', () => {
      // Buffer JPEG valid tetapi melebihi 5MB
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      oversizedBuffer[0] = 0xff;
      oversizedBuffer[1] = 0xd8;
      oversizedBuffer[2] = 0xff;

      const result = validateProofMagicBytes(oversizedBuffer);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('melebihi batas maksimum 5 MB');
    });

    it('pengurus dari organisasi lain ditolak HTTP 403 saat mencoba mencatat ke campaign ini', async () => {
      // Sesi dari organisasi lain
      currentMockSession = {
        user: { id: 'usr-lain', email: 'lain@org.com', role: 'ORG_ADMIN', organizationId: 'org-lain' },
        organization: { id: 'org-lain', name: 'Yayasan Lain' },
      };

      (prisma as any)._seedStore(
        [{ id: 'camp-al-ikhlas', organizationId: 'org-al-ikhlas', status: 'ACTIVE' }],
        []
      );

      const req = new Request('http://localhost:3000/api/admin/entries/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'camp-al-ikhlas',
          amount: '1000000',
          description: 'Semen',
          proofUrl: '/uploads/proofs/nota.jpg',
          proofSha256: 'abc123sha',
        }),
      });

      const res = await recordExpense(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.message).toContain('tidak memiliki hak akses');
    });

    it('pengeluaran tanpa foto bukti wajib ditolak HTTP 422', async () => {
      (prisma as any)._seedStore(
        [{ id: 'camp-01', organizationId: 'org-al-ikhlas', status: 'ACTIVE' }],
        []
      );

      const req = new Request('http://localhost:3000/api/admin/entries/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'camp-01',
          amount: '1000000',
          description: 'Beli semen',
          // Tanpa proofUrl / proofSha256
        }),
      });

      const res = await recordExpense(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.message).toContain('Foto bukti nota wajib dilampirkan');
    });

    it('pengeluaran yang melebihi saldo kas tersedia wajib ditolak HTTP 422 dengan menyebut saldo tersedia', async () => {
      // Seed kas masuk 5.000.000
      (prisma as any)._seedStore(
        [{ id: 'camp-01', organizationId: 'org-al-ikhlas', status: 'ACTIVE' }],
        [
          {
            id: 'e1',
            campaignId: 'camp-01',
            seq: 1,
            type: 'IN',
            amount: 5000000n,
            fee: 0n,
            hash: 'hash1',
            prevHash: '00000',
          },
        ]
      );

      // Coba keluar 6.000.000 (melebihi saldo 5.000.000)
      const req = new Request('http://localhost:3000/api/admin/entries/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'camp-01',
          amount: '6000000',
          description: 'Baja ringan',
          proofUrl: '/uploads/proofs/nota-baja.jpg',
          proofSha256: 'sha-baja',
        }),
      });

      const res = await recordExpense(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.message).toContain('melebihi saldo tersedia');
      expect(json.message).toContain('5.000.000');
    });

    it('pengeluaran yang sah berhasil dicatat dengan nomor seq berikutnya dan bukti nota', async () => {
      (prisma as any)._seedStore(
        [{ id: 'camp-01', organizationId: 'org-al-ikhlas', status: 'ACTIVE' }],
        [
          {
            id: 'e1',
            campaignId: 'camp-01',
            seq: 1,
            type: 'IN',
            amount: 10000000n,
            fee: 0n,
            hash: 'hash1',
            prevHash: '0'.repeat(64),
          },
        ]
      );

      const req = new Request('http://localhost:3000/api/admin/entries/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'camp-01',
          amount: '4500000',
          description: 'Semen 40 sak Toko Bangunan Makmur',
          proofUrl: '/uploads/proofs/semen.jpg',
          proofSha256: 'sha-semen',
        }),
      });

      const res = await recordExpense(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.seq).toBe(2);
      expect(json.data.type).toBe('OUT');
      expect(json.data.amount).toBe('4500000');
      expect(json.data.proofUrl).toBe('/uploads/proofs/semen.jpg');
    });
  });

  describe('US-4: Pengurus Mencatat Pemasukan Manual (P0)', () => {
    it('pemasukan manual tercatat dengan source=MANUAL dan berlabel Dicatat pengurus', async () => {
      (prisma as any)._seedStore(
        [{ id: 'camp-01', organizationId: 'org-al-ikhlas', status: 'ACTIVE' }],
        []
      );

      const req = new Request('http://localhost:3000/api/admin/entries/manual-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'camp-01',
          amount: '1275000',
          donorName: 'Kotak amal Jumat',
          description: 'Sumbangan kotak amal musala',
        }),
      });

      const res = await recordManualIncome(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.source).toBe('MANUAL');
      expect(json.data.type).toBe('IN');
      expect(json.message).toContain('Dicatat pengurus');
    });
  });

  describe('US-1: Donatur Melihat Campaign dan Buku Kasnya (P0)', () => {
    it('campaign DRAFT mengembalikan status HTTP 404 bagi publik tanpa login', async () => {
      currentMockSession = null; // Tanpa sesi (publik)

      (prisma as any)._seedStore(
        [{ id: 'camp-draft', slug: 'musala-draft', status: 'DRAFT', organizationId: 'org-al-ikhlas' }],
        []
      );

      const res = await getPublicCampaign(new Request('http://localhost:3000'), {
        params: Promise.resolve({ slug: 'musala-draft' }),
      });

      expect(res.status).toBe(404);
    });

    it('campaign ACTIVE terbuka bagi publik dan menyajikan ringkasan saldo murni', async () => {
      currentMockSession = null;

      (prisma as any)._seedStore(
        [
          {
            id: 'camp-active',
            slug: 'atap-musala-al-ikhlas',
            title: 'Atap Musala Al-Ikhlas',
            story: 'Kisah renovasi musala Karangpoh',
            basis: 'BERIZIN',
            permitNumber: '188/412/2026',
            status: 'ACTIVE',
            targetAmount: 85000000n,
            organizationId: 'org-al-ikhlas',
          },
        ],
        [
          {
            id: 'e1',
            campaignId: 'camp-active',
            seq: 1,
            type: 'IN',
            source: 'MANUAL',
            amount: 10000000n,
            fee: 0n,
            occurredAt: new Date(),
            hash: 'h1',
            prevHash: '000',
            isAnonymous: false,
          },
        ]
      );

      const res = await getPublicCampaign(new Request('http://localhost:3000'), {
        params: Promise.resolve({ slug: 'atap-musala-al-ikhlas' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.title).toBe('Atap Musala Al-Ikhlas');
      expect(json.data.financial.saldo).toBe('10000000');
    });

    it('privasi donatur: jika donatur memilih anonim, nama asli TIDAK PERNAH bocor di respons API publik', async () => {
      currentMockSession = null;

      (prisma as any)._seedStore(
        [{ id: 'camp-active', slug: 'atap-musala', status: 'ACTIVE', organizationId: 'org-al-ikhlas' }],
        [
          {
            id: 'e1',
            campaignId: 'camp-active',
            seq: 1,
            type: 'IN',
            source: 'MIDTRANS',
            amount: 250000n,
            fee: 1750n,
            occurredAt: new Date(),
            donorName: 'Nama Rahasia Donatur Konglomerat', // Nama asli di DB
            isAnonymous: true, // Donatur memilih sembunyikan nama
            hash: 'h1',
            prevHash: '000',
          },
        ]
      );

      const res = await getPublicCampaign(new Request('http://localhost:3000'), {
        params: Promise.resolve({ slug: 'atap-musala' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      const entry = json.data.entries[0];

      // Nama asli tidak boleh ada
      expect(entry.donorName).toBe('Anonim');
      expect(JSON.stringify(json)).not.toContain('Nama Rahasia Donatur Konglomerat');
    });

    it('cursor pagination membatasi maksimum 50 entri per halaman pada buku kas publik', async () => {
      currentMockSession = null;

      // Buat 55 entri
      const mock55Entries = Array.from({ length: 55 }, (_, i) => ({
        id: `e-${i + 1}`,
        campaignId: 'camp-active',
        seq: i + 1,
        type: 'IN',
        source: 'MANUAL',
        amount: 100000n,
        fee: 0n,
        occurredAt: new Date(),
        hash: `h-${i + 1}`,
        prevHash: `h-${i}`,
        isAnonymous: false,
      }));

      (prisma as any)._seedStore(
        [{ id: 'camp-active', slug: 'atap-musala', status: 'ACTIVE', organizationId: 'org-al-ikhlas' }],
        mock55Entries
      );

      const res = await getPublicCampaign(new Request('http://localhost:3000?limit=50'), {
        params: Promise.resolve({ slug: 'atap-musala' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.entries.length).toBe(50);
      expect(json.data.pagination.hasMore).toBe(true);
      expect(json.data.pagination.nextCursor).toBeDefined();
    });
  });
});
