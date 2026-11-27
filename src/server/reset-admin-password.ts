import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getDb, PostgresDatabase } from './db-postgres';
import type { StoredUser } from '../types';

type ResetArgs = {
  email: string;
  password: string;
};

let db: PostgresDatabase | undefined;

function parseArgs(argv: string[]): Partial<ResetArgs> {
  const parsed: Partial<ResetArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--email' && next) {
      parsed.email = next;
      index += 1;
      continue;
    }

    if (token === '--password' && next) {
      parsed.password = next;
      index += 1;
      continue;
    }
  }

  return parsed;
}

function requireTemporaryPassword(candidate: string | undefined) {
  if (!candidate) {
    throw new Error('Provide a temporary password via ADMIN_BOOTSTRAP_PASSWORD or --password.');
  }

  if (candidate.length < 12) {
    throw new Error('Temporary password must be at least 12 characters long.');
  }

  return candidate;
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const email = cliArgs.email ?? process.env.ADMIN_RESET_EMAIL ?? 'admin@maz.co.zw';
  const password = requireTemporaryPassword(cliArgs.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? process.env.ADMIN_RESET_PASSWORD);

  db = getDb();

  await db.ready();

  const user = await db.findUserByEmail(email);
  if (!user) {
    throw new Error(`No user found with email ${email}.`);
  }

  if (user.role !== 'admin') {
    throw new Error(`Refusing to reset password for non-admin user ${email}.`);
  }

  if (user.status !== 'active') {
    throw new Error(`Refusing to reset password for disabled admin ${email}.`);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const updatedUser: StoredUser = {
    ...user,
    hasSetPassword: true,
    password: hashedPassword
  };

  await db.saveUser(updatedUser);
  await db.revokeUserAuthSessions(user.id);

  const persistedUser = await db.findUserByEmail(email);
  if (!persistedUser || persistedUser.password !== hashedPassword || !persistedUser.hasSetPassword) {
    throw new Error(`Password update for ${email} did not persist correctly.`);
  }

  const passwordMatches = await bcrypt.compare(password, persistedUser.password);
  if (!passwordMatches) {
    throw new Error(`Password verification failed for ${email}.`);
  }

  console.log(`Password reset complete for ${email}.`);
  console.log('Login verification passed.');
  console.log('Rotate the temporary password immediately after regaining access.');
}

main()
  .catch((error) => {
    console.error('Admin password reset failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db?.closePool();
    } catch (error) {
      // Ignore shutdown errors so the process still exits cleanly.
    }
  });
