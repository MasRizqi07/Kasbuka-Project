import type { Metadata } from 'next';
import { Schibsted_Grotesk, Kalam } from 'next/font/google';
import './globals.css';

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-utama-next',
  display: 'swap',
});

const kalam = Kalam({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-tangan-next',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kasbuka — Buku kas penggalangan dana komunitas',
  description: 'Buku kas penggalangan dana yang boleh dibuka siapa saja. Catatan masuk dan keluar transparan dengan bukti nota nyata.',
  metadataBase: new URL('https://kasbuka.org'),
  openGraph: {
    title: 'Kasbuka — Buku Kas Terbuka Komunitas',
    description: 'Catatan rupiah masuk dan keluar penggalangan dana dengan bukti nota nyata.',
    siteName: 'Kasbuka',
    locale: 'id_ID',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${schibsted.variable} ${kalam.variable}`}>
      <body>{children}</body>
    </html>
  );
}
