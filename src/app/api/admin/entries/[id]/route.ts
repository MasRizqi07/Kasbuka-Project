import { NextResponse } from 'next/server';

/**
 * Endpoint Entri Buku Kas Spesifik
 * ATURAN MUTLAK (PRD US-5 & Bagian 10):
 * Entri ledger bersifat append-only dan tidak pernah boleh di-edit atau di-delete.
 * Permintaan PUT, PATCH, atau DELETE wajib ditolak dengan HTTP 405 Method Not Allowed.
 */

export async function PUT() {
  return methodNotAllowedResponse();
}

export async function PATCH() {
  return methodNotAllowedResponse();
}

export async function DELETE() {
  return methodNotAllowedResponse();
}

function methodNotAllowedResponse() {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Entri buku kas Kasbuka bersifat append-only dan tidak dapat diubah atau dihapus. Gunakan entri REVERSAL untuk koreksi kesalahan.',
    },
    {
      status: 405,
      headers: {
        Allow: 'GET',
      },
    }
  );
}
