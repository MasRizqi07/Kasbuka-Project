import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@kasbuka.org';
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'AdminKasbuka123!';
  const orgName = process.argv[4] || process.env.ADMIN_ORG || 'Organisasi Komunitas Kasbuka';
  const name = process.argv[5] || 'Pengurus Utama';

  console.log(`Membuat akun admin untuk: ${email} (${orgName})...`);

  let org = await prisma.organization.findFirst({
    where: { name: orgName },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: { name: orgName },
    });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        name,
        organizationId: org.id,
      },
    });
    console.log(`User ${email} berhasil diperbarui.`);
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
    console.log(`User ${email} berhasil dibuat sebagai ORG_ADMIN.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

