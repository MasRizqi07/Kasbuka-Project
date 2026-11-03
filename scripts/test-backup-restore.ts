import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { LedgerService } from '../src/lib/ledger/service';

const PG_DUMP = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
const PSQL = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const DUMP_PATH = path.join(process.cwd(), 'kasbuka_backup_test.sql');
const RESTORE_DB = 'kasbuka_restore_test';

async function main() {
  console.log('=== UJI RESTORE BACKUP DATABASE KASBUKA ===');
  console.log('1. Mengambil dump dari database sumber: kasbuka...');
  if (fs.existsSync(DUMP_PATH)) {
    fs.unlinkSync(DUMP_PATH);
  }

  // Dump schema dan data
  execSync(`"${PG_DUMP}" -p 5433 -U postgres -d kasbuka -f "${DUMP_PATH}"`, {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });
  console.log(`Dump berhasil disimpan: ${DUMP_PATH} (${(fs.statSync(DUMP_PATH).size / 1024).toFixed(2)} KB)`);

  console.log('2. Menyiapkan database target yang bersih: kasbuka_restore_test...');
  // Drop database lama jika ada dan buat baru
  execSync(`"${PSQL}" -p 5433 -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"`, {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });
  execSync(`"${PSQL}" -p 5433 -U postgres -d postgres -c "CREATE DATABASE ${RESTORE_DB};"`, {
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });

  console.log('3. Melakukan pemulihan (restore) dump ke database kasbuka_restore_test...');
  execSync(`"${PSQL}" -p 5433 -U postgres -d ${RESTORE_DB} -f "${DUMP_PATH}"`, {
    stdio: 'pipe',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });
  console.log('Restore database selesai.');

  console.log('4. Memeriksa status trigger proteksi append-only di database pulihan...');
  const triggerCheck = execSync(
    `"${PSQL}" -p 5433 -U postgres -d ${RESTORE_DB} -t -A -c "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_ledger_entry_append_only';"`
  )
    .toString()
    .trim();
  console.log('Status trigger di database pulihan:', triggerCheck);
  if (!triggerCheck.includes('trg_ledger_entry_append_only|O')) {
    throw new Error(`Trigger tidak aktif atau tidak ditemukan: ${triggerCheck}`);
  }

  console.log('5. Menghubungkan Prisma ke database kasbuka_restore_test...');
  const prismaRestored = new PrismaClient({
    datasources: {
      db: { url: `postgresql://postgres:postgres@localhost:5433/${RESTORE_DB}` },
    },
  });

  try {
    const campaigns = await prismaRestored.campaign.findMany({
      include: {
        _count: { select: { ledgerEntries: true } },
      },
    });

    console.log(`Ditemukan ${campaigns.length} campaign di database hasil restore.`);

    for (const c of campaigns) {
      console.log(`\nMemverifikasi campaign "${c.title}" (${c.slug}, total entri: ${c._count.ledgerEntries})...`);
      const verification = await LedgerService.verifyCampaignLedger(c.id, prismaRestored);
      console.log(`- Status: ${verification.isValid ? 'VALID' : 'RUSAK'}`);
      console.log(`- Total Checked: ${verification.totalEntries}`);
      console.log(`- Last Hash: ${verification.lastHash}`);

      if (!verification.isValid) {
        throw new Error(`Verifikasi integritas GAGAL pada campaign ${c.slug}: ${verification.errorReason}`);
      }
    }

    console.log('\n=== KESIMPULAN UJI RESTORE: SEMUA CAMPAIGN VALID, TRIGGER AKTIF (O), 100% SUKSES ===');
  } finally {
    await prismaRestored.$disconnect();
    // Bersihkan database uji dan file dump
    console.log('Membersihkan database uji kasbuka_restore_test dan file dump...');
    execSync(`"${PSQL}" -p 5433 -U postgres -d postgres -c "DROP DATABASE ${RESTORE_DB};"`, {
      stdio: 'inherit',
      env: { ...process.env, PGPASSWORD: 'postgres' },
    });
    if (fs.existsSync(DUMP_PATH)) {
      fs.unlinkSync(DUMP_PATH);
    }
    console.log('Pembersihan selesai.');
  }
}

main().catch((err) => {
  console.error('Uji restore gagal:', err);
  process.exit(1);
});
