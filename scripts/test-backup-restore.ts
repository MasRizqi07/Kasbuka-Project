import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { LedgerService } from '../src/lib/ledger/service';

const DUMP_PATH = path.join(process.cwd(), 'kasbuka_backup_test.sql');
const RESTORE_DB = 'kasbuka_restore_test';
const APP_TABLES = [
  'Campaign',
  'Donation',
  'LedgerEntry',
  'Organization',
  'RateLimit',
  'Session',
  'User',
  'WebhookEvent',
];

function findPgBinary(tool: 'pg_dump' | 'psql'): string {
  const isWin = process.platform === 'win32';
  const exe = isWin ? `${tool}.exe` : tool;

  const customDir = process.env.PG_BIN_DIR?.trim();
  if (customDir) {
    const candidate = path.join(customDir, exe);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    execFileSync(tool, ['--version'], { stdio: 'ignore' });
    return tool;
  } catch {
    // Coba lokasi instalasi PostgreSQL standar di Windows
  }

  if (isWin) {
    for (const ver of ['18', '17', '16', '15']) {
      const candidate = `C:\\Program Files\\PostgreSQL\\${ver}\\bin\\${exe}`;
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    `Binary '${tool}' tidak ditemukan di PATH. Pasang PostgreSQL client tools atau set PG_BIN_DIR.`
  );
}

function maskDbTarget(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '<database-url>';
  }
}

function buildTargetDbUrl(adminUrlStr: string, dbName: string): string {
  const u = new URL(adminUrlStr);
  u.pathname = `/${dbName}`;
  u.search = '';
  return u.toString();
}

/**
 * Mengekstrak kredensial ke env libpq (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE)
 * agar secret database tidak pernah muncul di argumen CLI atau stack trace error.
 */
function buildPgEnv(urlStr: string): NodeJS.ProcessEnv {
  const u = new URL(urlStr);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username || 'postgres'),
    PGPASSWORD: decodeURIComponent(u.password || ''),
    PGDATABASE: u.pathname.replace(/^\/+/, '') || 'postgres',
  };
  const sslMode = u.searchParams.get('sslmode');
  if (sslMode) {
    env.PGSSLMODE = sslMode;
  }
  return env;
}

function getDumpArg(): string | null {
  const envPath = process.env.RESTORE_DUMP_FILE?.trim();
  if (envPath) return path.resolve(envPath);
  const cliArg = process.argv.find((a) => a.startsWith('--dump='));
  if (cliArg) return path.resolve(cliArg.slice('--dump='.length));
  return null;
}

async function main() {
  console.log('=== UJI RESTORE BACKUP DATABASE KASBUKA ===');

  const psqlBin = findPgBinary('psql');
  const suppliedDump = getDumpArg();
  const useTempDump = !suppliedDump;
  const activeDumpPath = suppliedDump ?? DUMP_PATH;

  const adminUrl =
    process.env.RESTORE_ADMIN_URL?.trim() ||
    'postgresql://postgres:postgres@localhost:5433/postgres';
  const adminEnv = buildPgEnv(adminUrl);
  const restoredDbUrl = buildTargetDbUrl(adminUrl, RESTORE_DB);
  const restoredEnv = buildPgEnv(restoredDbUrl);

  let createdDb = false;
  let prismaRestored: PrismaClient | null = null;

  try {
    if (suppliedDump) {
      if (!fs.existsSync(activeDumpPath)) {
        throw new Error(`File dump tidak ditemukan: ${activeDumpPath}`);
      }
      console.log(`1. Memakai file dump eksternal untuk uji restore: ${activeDumpPath}`);
    } else {
      const pgDumpBin = findPgBinary('pg_dump');
      const sourceUrl =
        process.env.SOURCE_DATABASE_URL?.trim() ||
        process.env.DIRECT_URL?.trim() ||
        process.env.DATABASE_URL?.trim() ||
        'postgresql://postgres:postgres@localhost:5433/kasbuka';

      console.log(`1. Mengambil dump schema public dari sumber: ${maskDbTarget(sourceUrl)}...`);
      if (fs.existsSync(DUMP_PATH)) {
        fs.unlinkSync(DUMP_PATH);
      }

      execFileSync(
        pgDumpBin,
        ['--schema=public', '--no-owner', '--no-acl', '-f', activeDumpPath],
        { stdio: 'inherit', env: buildPgEnv(sourceUrl) }
      );
      console.log(
        `Dump berhasil disimpan (${(fs.statSync(activeDumpPath).size / 1024).toFixed(2)} KB)`
      );
    }

    console.log(`2. Menyiapkan database target bersih: ${RESTORE_DB} (${maskDbTarget(adminUrl)})...`);
    execFileSync(
      psqlBin,
      ['-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS "${RESTORE_DB}";`],
      { stdio: 'inherit', env: adminEnv }
    );
    execFileSync(
      psqlBin,
      ['-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${RESTORE_DB}";`],
      { stdio: 'inherit', env: adminEnv }
    );
    createdDb = true;

    // Jika file dump memuat CREATE SCHEMA public, hapus schema public bawaan agar ON_ERROR_STOP aman
    const dumpSqlPreview = fs.readFileSync(activeDumpPath, 'utf8').slice(0, 8192);
    if (/CREATE\s+SCHEMA\s+"?public"?\s*;/i.test(dumpSqlPreview)) {
      execFileSync(
        psqlBin,
        ['-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA IF EXISTS public CASCADE;'],
        { stdio: 'pipe', env: restoredEnv }
      );
    }

    console.log(`3. Melakukan restore dump ke ${RESTORE_DB}...`);
    execFileSync(
      psqlBin,
      ['-v', 'ON_ERROR_STOP=1', '-f', activeDumpPath],
      { stdio: 'pipe', env: restoredEnv }
    );
    console.log('Restore database selesai.');

    console.log('4. Memeriksa status trigger append-only dan RLS pada database pulihan...');
    prismaRestored = new PrismaClient({
      datasources: {
        db: { url: restoredDbUrl },
      },
    });

    const triggerRows = await prismaRestored.$queryRaw<
      Array<{ tgname: string; tgenabled: string }>
    >`
      SELECT tgname, tgenabled::text AS tgenabled
      FROM pg_trigger
      WHERE tgname = 'trg_ledger_entry_append_only';
    `;

    console.log('Status trigger di database pulihan:', triggerRows);
    if (triggerRows.length === 0 || triggerRows[0].tgenabled !== 'O') {
      throw new Error(
        'Trigger trg_ledger_entry_append_only tidak aktif (tgenabled != O) di database pulihan.'
      );
    }

    const rlsRows = await prismaRestored.$queryRaw<
      Array<{ tablename: string; rowsecurity: boolean }>
    >`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;

    const rlsMap = new Map(rlsRows.map((r) => [r.tablename, r.rowsecurity]));
    for (const tableName of APP_TABLES) {
      if (!rlsMap.get(tableName)) {
        throw new Error(`RLS tidak aktif pada tabel "${tableName}" di database pulihan.`);
      }
    }
    console.log(
      `RLS terverifikasi aktif (rowsecurity=true) pada ${APP_TABLES.length} tabel aplikasi.`
    );

    console.log('5. Memverifikasi rantai hash SHA-256 seluruh campaign di database pulihan...');
    const campaigns = await prismaRestored.campaign.findMany({
      include: {
        _count: { select: { ledgerEntries: true } },
      },
    });

    console.log(`Ditemukan ${campaigns.length} campaign di database hasil restore.`);

    for (const c of campaigns) {
      console.log(
        `Memverifikasi campaign "${c.title}" (${c.slug}, total entri: ${c._count.ledgerEntries})...`
      );
      const verification = await LedgerService.verifyCampaignLedger(c.id, prismaRestored);
      console.log(
        `- Status: ${verification.isValid ? 'VALID' : 'RUSAK'} | Total: ${verification.totalEntries} | Last Hash: ${verification.lastHash}`
      );

      if (!verification.isValid) {
        throw new Error(
          `Verifikasi integritas GAGAL pada campaign ${c.slug}: ${verification.errorReason}`
        );
      }
    }

    console.log(
      '\n=== KESIMPULAN UJI RESTORE: SEMUA CAMPAIGN VALID, TRIGGER AKTIF (O), RLS AKTIF (8 TABEL), 100% SUKSES ==='
    );
  } finally {
    if (prismaRestored) {
      await prismaRestored.$disconnect();
    }
    if (createdDb) {
      console.log(`Membersihkan database uji ${RESTORE_DB}...`);
      try {
        execFileSync(
          psqlBin,
          ['-c', `DROP DATABASE IF EXISTS "${RESTORE_DB}";`],
          { stdio: 'inherit', env: adminEnv }
        );
      } catch {
        // Ignored on cleanup
      }
    }
    if (useTempDump && fs.existsSync(DUMP_PATH)) {
      fs.unlinkSync(DUMP_PATH);
    }
    console.log('Pembersihan selesai.');
  }
}

main().catch((err) => {
  console.error('Uji restore gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
