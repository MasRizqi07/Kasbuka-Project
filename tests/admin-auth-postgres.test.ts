import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';

const { testPrisma } = vi.hoisted(() => {
  const dbUrl = process.env.DATABASE_URL_TEST;
  if (!dbUrl) {
    throw new Error('DATABASE_URL_TEST wajib disetel ke kasbuka_test untuk tes integrasi.');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('@prisma/client');
  return {
    testPrisma: new PrismaClient({
      datasources: { db: { url: dbUrl } },
    }),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: testPrisma,
}));

import { POST as handleLogin } from '@/app/api/auth/login/route';
import { POST as handleLogout } from '@/app/api/auth/logout/route';
import { GET as handleGetOrganization } from '@/app/api/admin/organization/route';
import { hashSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

const prisma = testPrisma;

describe('Postgres Live Integration Test (kasbuka_test): Autentikasi Pengurus (Aturan 8.5 J)', () => {
  let testOrgId: string;
  let testUserId: string;
  const rawPassword = 'PasswordPengurusKuat123!';
  const userEmail = 'pengurus.pilot@kasbuka.org';

  beforeEach(async () => {
    // Bersihkan data lama
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Organization", "User", "Session", "RateLimit" CASCADE;'
    );

    // Siapkan organisasi & user pengurus
    const org = await prisma.organization.create({
      data: { name: 'Komunitas Pengurus Uji' },
    });
    testOrgId = org.id;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPassword, salt);

    const user = await prisma.user.create({
      data: {
        email: userEmail,
        passwordHash,
        organizationId: testOrgId,
        role: 'ORG_ADMIN',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Login benar lalu rute admin mengembalikan status 200', async () => {
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.101',
      },
      body: JSON.stringify({
        email: userEmail,
        password: rawPassword,
      }),
    });

    const loginRes = await handleLogin(loginReq);
    expect(loginRes.status).toBe(200);

    const cookieObj = loginRes.cookies.get(SESSION_COOKIE_NAME);
    expect(cookieObj).toBeDefined();
    const rawSessionToken = cookieObj?.value;
    expect(rawSessionToken).toBeDefined();

    // Gunakan cookie untuk memanggil rute admin terproteksi
    const adminReq = new Request('http://localhost:3000/api/admin/organization', {
      method: 'GET',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${rawSessionToken}`,
      },
    });

    const adminRes = await handleGetOrganization(adminReq);
    expect(adminRes.status).toBe(200);
    const orgData = await adminRes.json();
    expect(orgData.data.id).toBe(testOrgId);
    expect(orgData.data.name).toBe('Komunitas Pengurus Uji');
  });

  it('2. Nilai di tabel Session adalah hash SHA-256, bukan nilai cookie mentah', async () => {
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.102',
      },
      body: JSON.stringify({
        email: userEmail,
        password: rawPassword,
      }),
    });

    const loginRes = await handleLogin(loginReq);
    expect(loginRes.status).toBe(200);

    const cookieObj = loginRes.cookies.get(SESSION_COOKIE_NAME);
    expect(cookieObj).toBeDefined();
    const rawCookieValue = cookieObj!.value;

    // Ambil baris Session di PostgreSQL
    const sessions = await prisma.session.findMany({
      where: { userId: testUserId },
    });
    expect(sessions.length).toBe(1);

    const dbTokenValue = sessions[0].token;

    // Nilai di DB HARUS berbeda dengan raw cookie token
    expect(dbTokenValue).not.toBe(rawCookieValue);

    // Nilai di DB HARUS sama dengan hasil hash SHA-256 dari raw cookie token
    const expectedHash = hashSessionToken(rawCookieValue);
    expect(dbTokenValue).toBe(expectedHash);
  });

  it('3. Logout menghapus baris sesi di database lalu rute admin mengembalikan 401', async () => {
    // Login terlebih dahulu
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.103',
      },
      body: JSON.stringify({
        email: userEmail,
        password: rawPassword,
      }),
    });

    const loginRes = await handleLogin(loginReq);
    const cookieObj = loginRes.cookies.get(SESSION_COOKIE_NAME);
    expect(cookieObj).toBeDefined();
    const rawSessionToken = cookieObj!.value;

    // Pastikan baris sesi ada di database
    const hashed = hashSessionToken(rawSessionToken);
    const sessionBefore = await prisma.session.findUnique({ where: { token: hashed } });
    expect(sessionBefore).not.toBeNull();

    // Panggil logout
    const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${rawSessionToken}`,
      },
    });

    const logoutRes = await handleLogout(logoutReq);
    expect(logoutRes.status).toBe(200);

    // Baris sesi di DB harus sudah terhapus
    const sessionAfter = await prisma.session.findUnique({ where: { token: hashed } });
    expect(sessionAfter).toBeNull();

    // Panggil rute admin dengan cookie yang sama -> 401 Unauthorized
    const adminReq = new Request('http://localhost:3000/api/admin/organization', {
      method: 'GET',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${rawSessionToken}`,
      },
    });

    const adminRes = await handleGetOrganization(adminReq);
    expect(adminRes.status).toBe(401);
  });

  it('4. Sesi kedaluwarsa mengembalikan status 401', async () => {
    const expiredRawToken = 'expired-session-token-xyz';
    const expiredHashed = hashSessionToken(expiredRawToken);

    // Simpan sesi yang sudah kadaluarsa (kemarin)
    await prisma.session.create({
      data: {
        userId: testUserId,
        token: expiredHashed,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 hari yang lalu
      },
    });

    const adminReq = new Request('http://localhost:3000/api/admin/organization', {
      method: 'GET',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${expiredRawToken}`,
      },
    });

    const adminRes = await handleGetOrganization(adminReq);
    expect(adminRes.status).toBe(401);
  });

  it('5. Email beda huruf besar tetap bisa login (case-insensitive)', async () => {
    const mixedEmail = 'PENGURUS.PILOT@KASBUKA.ORG';

    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.105',
      },
      body: JSON.stringify({
        email: mixedEmail,
        password: rawPassword,
      }),
    });

    const loginRes = await handleLogin(loginReq);
    expect(loginRes.status).toBe(200);
    const data = await loginRes.json();
    expect(data.user.email).toBe(userEmail);
  });

  it('6. Batas rate limit per email bekerja (limit 5 per menit)', async () => {
    const targetEmail = 'ratelimit.test@kasbuka.org';

    // Buat 5 percobaan login gagal berturut-turut dari IP berbeda agar tidak kena IP limit lebih dulu
    for (let i = 1; i <= 5; i++) {
      const req = new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `10.0.0.${i}`, // IP unik setiap request
        },
        body: JSON.stringify({
          email: targetEmail,
          password: 'PasswordSalah123!',
        }),
      });

      const res = await handleLogin(req);
      expect(res.status).toBe(401); // 401 gagal kredensial biasa
    }

    // Percobaan ke-6 untuk email yang sama HARUS diblokir oleh email rate limiter (429)
    const req6 = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.99', // IP baru
      },
      body: JSON.stringify({
        email: targetEmail,
        password: 'PasswordSalah123!',
      }),
    });

    const res6 = await handleLogin(req6);
    expect(res6.status).toBe(429);
    const json6 = await res6.json();
    expect(json6.error).toContain('Terlalu banyak percobaan login untuk akun ini');
  });

  it('7. Jalur user tidak ada tetap menjalankan perbandingan bcrypt (mitigasi timing attack)', async () => {
    const spyBcryptCompare = vi.spyOn(bcrypt, 'compare');

    const nonExistentEmail = 'tidak.ada.di.database@kasbuka.org';
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.107',
      },
      body: JSON.stringify({
        email: nonExistentEmail,
        password: 'PasswordSembarang123!',
      }),
    });

    const res = await handleLogin(req);
    expect(res.status).toBe(401);

    // Pastikan bcrypt.compare dipanggil meski user tidak ditemukan di database
    expect(spyBcryptCompare).toHaveBeenCalled();

    spyBcryptCompare.mockRestore();
  });

  it('8. Waktu respons antara email tidak ada dan password salah sebanding (mitigasi timing attack - Aturan 5B R)', async () => {
    // Ukur durasi untuk email yang ada tapi password salah
    const t0Wrong = performance.now();
    const resWrong = await handleLogin(new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.181',
      },
      body: JSON.stringify({
        email: userEmail,
        password: 'PasswordSalah999!',
      }),
    }));
    const durationWrong = performance.now() - t0Wrong;
    expect(resWrong.status).toBe(401);

    // Ukur durasi untuk email yang tidak ada di database sama sekali
    const t0NotFound = performance.now();
    const resNotFound = await handleLogin(new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.182',
      },
      body: JSON.stringify({
        email: 'user.pasti.tidak.ada@kasbuka.org',
        password: 'PasswordSalah999!',
      }),
    }));
    const durationNotFound = performance.now() - t0NotFound;
    expect(resNotFound.status).toBe(401);

    // Keduanya menjalankan 1x bcrypt compare (cost 10) + DB query
    // Rasio kasar tidak boleh terpaut ekstrem (misal 1ms vs 80ms jika dummy hash absen)
    const ratio = durationNotFound / durationWrong;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(5.0);
  });
});
