import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Kalam:wght@400&family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,700;0,800;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
