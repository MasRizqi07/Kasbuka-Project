import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { GET as getCampaigns, POST as postCampaigns } from '@/app/api/admin/campaigns/route';
import { GET as getEntries } from '@/app/api/admin/entries/route';
import { GET as getOrganization } from '@/app/api/admin/organization/route';

// Mock cookies & getServerSession untuk simulasi tanpa sesi
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    getServerSession: vi.fn().mockResolvedValue(null), // Default: tidak ada sesi
  };
});

describe('Fase 1 Evidence Gate: Proteksi Rute Admin Tanpa Sesi', () => {
  describe('1. Uji Proxy Next.js Terpusat (matcher /api/admin/* dan /dashboard/*)', () => {
    const adminRoutes = [
      '/api/admin/campaigns',
      '/api/admin/entries',
      '/api/admin/organization',
      '/api/admin/arbitrary-subroute',
      '/api/admin/ledger/reversal',
    ];

    adminRoutes.forEach((route) => {
      it(`seharusnya mengembalikan status 401 untuk rute ${route} tanpa cookie sesi`, () => {
        const req = new NextRequest(`http://localhost:3000${route}`);
        const res = proxy(req);

        expect(res.status).toBe(401);
      });
    });

    it('seharusnya me-redirect ke /login ketika pengguna tanpa sesi mengakses /dashboard', () => {
      const req = new NextRequest('http://localhost:3000/dashboard');
      const res = proxy(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/login');
      expect(location).toContain('from=%2Fdashboard');
    });
  });

  describe('2. Uji Handler Route API Admin Langsung (withAdminAuth Defense in Depth)', () => {
    it('GET /api/admin/campaigns tanpa sesi harus mengembalikan status 401', async () => {
      const req = new Request('http://localhost:3000/api/admin/campaigns');
      const res = await getCampaigns(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
      expect(json.message).toContain('Sesi pengurus diperlukan');
    });

    it('POST /api/admin/campaigns tanpa sesi harus mengembalikan status 401', async () => {
      const req = new Request('http://localhost:3000/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Campaign Palsu', story: 'Cerita', basis: 'TERBATAS' }),
      });
      const res = await postCampaigns(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('GET /api/admin/entries tanpa sesi harus mengembalikan status 401', async () => {
      const req = new Request('http://localhost:3000/api/admin/entries?campaignId=123');
      const res = await getEntries(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('GET /api/admin/organization tanpa sesi harus mengembalikan status 401', async () => {
      const req = new Request('http://localhost:3000/api/admin/organization');
      const res = await getOrganization(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });
  });

  describe('3. Uji Keamanan: Tidak Ada Secret Client-Side', () => {
    it('tidak boleh ada secret dengan prefix NEXT_PUBLIC_ di environment variables', () => {
      const envKeys = Object.keys(process.env);
      const leakedSecrets = envKeys.filter(
        (key) => key.startsWith('NEXT_PUBLIC_') && (key.includes('SECRET') || key.includes('KEY'))
      );

      expect(leakedSecrets).toEqual([]);
    });
  });
});
