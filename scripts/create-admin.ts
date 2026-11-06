import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

const prisma = new PrismaClient();

/**
 * Membaca input dari terminal.
 * Jika hidden=true pada TTY, terminal diatur ke raw mode (tanpa echo karakter sama sekali)
 * untuk mencegah password bocor di layar terminal (Aturan 5B S).
 */
export async function askQuestion(query: string, hidden = false): Promise<string> {
  if (hidden && process.stdin.isTTY) {
    return new Promise((resolve) => {
      process.stdout.write(query);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === '\r' || char === '\n' || char === '\u0004') {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(input.trim());
            return;
          } else if (char === '\u0003') {
            // Ctrl+C
            process.stdin.setRawMode(false);
            process.exit(1);
          } else if (char === '\b' || char === '\x7f') {
            // Backspace: hapus karakter terakhir
            if (input.length > 0) {
              input = input.slice(0, -1);
            }
          } else {
            input += char;
          }
        }
      };

      process.stdin.on('data', onData);
    });
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function main() {
  const allowReset = process.argv.includes('--reset-password');

  let email = process.env.ADMIN_EMAIL?.trim();
  if (!email) {
    email = await askQuestion('Masukkan Email Admin: ');
  }

  if (!email) {
    console.error('Error: ADMIN_EMAIL wajib diisi (via environment variable atau prompt).');
    process.exit(1);
  }

  // Normalisasi email ke lowercase (Aturan 8.2 B & C)
  email = email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Error: Format email tidak valid.');
    process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD?.trim();
  if (!password) {
    password = await askQuestion('Masukkan Password Admin (min 12 karakter): ', true);
  }

  if (!password) {
    console.error('Error: ADMIN_PASSWORD wajib diisi (via environment variable atau prompt).');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Error: Password wajib minimal 12 karakter.');
    process.exit(1);
  }

  let orgName = process.env.ADMIN_ORG?.trim();
  if (!orgName) {
    orgName = await askQuestion('Masukkan Nama Organisasi: ');
  }

  if (!orgName) {
    console.error('Error: ADMIN_ORG wajib diisi (via environment variable atau prompt).');
    process.exit(1);
  }

  const name = process.env.ADMIN_NAME?.trim() || 'Pengurus Organisasi';

  let org = await prisma.organization.findFirst({
    where: { name: orgName },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: { name: orgName },
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  if (existingUser) {
    if (!allowReset) {
      console.error(
        `Error: Pengurus dengan email ${email} sudah ada. Gunakan flag --reset-password jika ingin menimpa password.`
      );
      process.exit(1);
    }

    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        name,
        organizationId: org.id,
      },
    });
    console.log(`Pengurus ${email} berhasil diperbarui.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'ORG_ADMIN',
        organizationId: org.id,
      },
    });
    console.log(`Pengurus ${email} berhasil dibuat.`);
  }
}

if (require.main === module || process.argv[1]?.includes('create-admin')) {
  main()
    .catch((e) => {
      console.error(e.message || e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
