import { PrismaClient, RoleSlug, SuperAdminStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const roles = [
    {
      slug: RoleSlug.SUPER_ADMIN,
      name: 'Super Admin',
      description: 'Full Control Plane access',
    },
    {
      slug: RoleSlug.FINANCIAL_ADMIN,
      name: 'Financial Admin',
      description: 'Financial modules read/operate where granted',
    },
    {
      slug: RoleSlug.COMPLIANCE_ADMIN,
      name: 'Compliance Admin',
      description: 'KYC / compliance modules',
    },
    {
      slug: RoleSlug.SUPPORT_ADMIN,
      name: 'Support Admin',
      description: 'Support-scoped operations',
    },
    {
      slug: RoleSlug.READ_ONLY,
      name: 'Read Only',
      description: 'Global read without mutations',
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description },
      create: role,
    });
  }

  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const name = process.env.SEED_SUPER_ADMIN_NAME || 'LOOR Super Admin';

  if (!email || !password) {
    console.log('Seed roles done. No SEED_SUPER_ADMIN_* — skipping operator seed.');
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping operator seed in production.');
    return;
  }

  const passwordHash = await argon2.hash(password);
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { slug: RoleSlug.SUPER_ADMIN },
  });

  const admin = await prisma.superAdmin.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      status: SuperAdminStatus.ACTIVE,
    },
    create: {
      name,
      email,
      passwordHash,
      status: SuperAdminStatus.ACTIVE,
    },
  });

  await prisma.superAdminRole.upsert({
    where: {
      superAdminId_roleId: {
        superAdminId: admin.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      superAdminId: admin.id,
      roleId: superAdminRole.id,
    },
  });

  console.log(`Dev operator seeded: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
