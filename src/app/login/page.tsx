'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal masuk. Silakan periksa kembali email dan password.');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--kertas)' }}>
      <header style={{ background: 'var(--kertas)', borderBottom: '1px solid var(--garis)', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', textDecoration: 'none', fontWeight: 800, fontSize: '22px', color: 'var(--tinta)' }}>
            <span>Kasbuka</span>
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '420px', width: '100%', background: 'var(--putih)', border: '1.5px solid var(--garis-tegas)', borderRadius: '10px', padding: '32px 28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--tinta)', marginBottom: '8px' }}>
            Masuk Pengurus
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--tinta-redup)', marginBottom: '24px', lineHeight: 1.5 }}>
            Khusus pengurus organisasi yang telah terdaftar untuk mengelola buku kas.
          </p>

          {error && (
            <div style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #F87171', borderRadius: '6px', padding: '10px 14px', fontSize: '13.5px', marginBottom: '20px' }} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '18px' }}>
              <label htmlFor="login-email" style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: 'var(--tinta)' }}>
                Email Pengurus
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pengurus@komunitas.id"
                style={{ width: '100%', height: '46px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid var(--garis-tegas)', fontSize: '15px' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="login-password" style={{ display: 'block', fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: 'var(--tinta)' }}>
                Kata Sandi
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%', height: '46px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid var(--garis-tegas)', fontSize: '15px' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', height: '48px', fontSize: '16px' }}
            >
              {loading ? 'Memeriksa...' : 'Masuk'}
            </button>
          </form>

          <div style={{ marginTop: '24px', borderTop: '1px solid var(--garis)', paddingTop: '16px', fontSize: '12.5px', color: 'var(--tinta-redup)', lineHeight: 1.4 }}>
            Pendaftaran pengurus baru hanya dibuka lewat undangan administrator demi keamanan buku kas (D2).
          </div>
        </div>
      </main>
    </div>
  );
}

