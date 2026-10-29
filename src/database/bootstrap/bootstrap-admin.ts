import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from '../data-source';
import { User, UserStatus } from '../entities/user.entity';
import { Role } from '../../modules/rbac/roles';

const deriveHandle = (email: string): string =>
  email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'admin';

async function bootstrapAdmin(): Promise<void> {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '';
  const fullName = (process.env.BOOTSTRAP_ADMIN_NAME ?? 'Platform Administrator').trim();

  if (!email || !password) {
    console.error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required to bootstrap the first administrator.',
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  await AppDataSource.initialize();

  try {
    const existing = await AppDataSource.getRepository(User).findOne({
      where: { role: Role.SUPER_ADMIN },
    });

    if (existing) {
      console.log(
        `A SuperAdmin already exists (${existing.email}). No new account was created.`,
      );
      return;
    }

    const base = deriveHandle(email);
    let handle = base;
    let suffix = 1;
    const repository = AppDataSource.getRepository(User);

    while (await repository.findOne({ where: { handle } })) {
      suffix += 1;
      handle = `${base}${suffix}`;
    }

    await repository.save(
      repository.create({
        fullName,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        handle,
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        jobTitle: 'Lead Administrator',
        division: 'Platform Operations',
        avatarUrl: null,
        lastActiveAt: null,
        inviteSent: false,
      }),
    );

    console.log(`Bootstrap administrator created for ${email}`);
  } finally {
    await AppDataSource.destroy();
  }
}

bootstrapAdmin().catch((error) => {
  console.error('Bootstrap failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
