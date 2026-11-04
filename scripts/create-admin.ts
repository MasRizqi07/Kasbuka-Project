import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';

const prisma = new PrismaClient();

async function askQuestion(query: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden && process.stdin.isTTY) {
      process.stdout.write(query);
      let input = '';
      const onData = (char: Buffer) => {
        const str = char.toString('utf8');
        if (str === '\n' || str === '\r' || str === '\u0004') {
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (str === '\u0003') {
          process.exit(1);
        } else if (str === '\b' || str === '\x7f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += str;
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

async function main() {
  const allowReset = process.argv.includes('--reset-password');

  let email = process.env.ADMIN_EMAIL?.trim();
  if (!email && process.stdin.isTTY) {
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
  if (!password && process.stdin.isTTY) {
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
  if (!orgName && process.stdin.isTTY) {
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

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
