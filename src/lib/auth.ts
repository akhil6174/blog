/**
 * Better Auth configuration (server side).
 * - Google sign-in in production.
 * - Email + password ONLY when AUTH_DEV_LOGIN=true (local testing without Google credentials).
 * - Roles: reader | writer | trusted | admin. Admin is assigned on sign-up when the email is in ADMIN_EMAILS.
 *
 * Created lazily per isolate because it needs the D1 binding and secrets from `cloudflare:workers` env.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from 'cloudflare:workers';
import { createDb, schema } from './db';
import { getSetting, getSettingBool, type SettingKey } from './db/settings';

type Secrets = { BETTER_AUTH_SECRET?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; AUTH_DEV_LOGIN?: string };
const secrets = env as unknown as Secrets;

export function adminEmails(): string[] {
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isDevLoginEnabled(): boolean {
  return secrets.AUTH_DEV_LOGIN === 'true';
}

/** Production needs a real BETTER_AUTH_SECRET; without it sign-in is disabled rather than running on a public fallback secret. */
export function isAuthConfigured(): boolean {
  return Boolean(secrets.BETTER_AUTH_SECRET) || isDevLoginEnabled();
}

export function isGoogleConfigured(): boolean {
  return Boolean(secrets.GOOGLE_CLIENT_ID && secrets.GOOGLE_CLIENT_SECRET);
}

function handleFromEmail(email: string): string {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'writer';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

let instance: ReturnType<typeof build> | undefined;

function build() {
  const google = isGoogleConfigured()
    ? { google: { clientId: secrets.GOOGLE_CLIENT_ID!, clientSecret: secrets.GOOGLE_CLIENT_SECRET!, prompt: 'select_account' as const } }
    : {};

  return betterAuth({
    appName: 'TrutiAI',
    baseURL: env.SITE_URL,
    secret: secrets.BETTER_AUTH_SECRET || 'dev-only-secret-change-me-dev-only-secret-change-me',
    basePath: '/api/auth',
    trustedOrigins: [env.SITE_URL, 'http://localhost:4321', 'http://127.0.0.1:4321'],
    database: drizzleAdapter(createDb(), { provider: 'sqlite', schema }),
    socialProviders: google,
    emailAndPassword: { enabled: isDevLoginEnabled(), requireEmailVerification: false },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'writer', input: false },
        handle: { type: 'string', required: false, input: false },
        bio: { type: 'string', required: false },
        trustScore: { type: 'number', required: false, defaultValue: 0, input: false },
        bannedAt: { type: 'date', required: false, input: false },
        shadowBanned: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            const email = (u.email || '').toLowerCase();
            const inviteOnly = await getSettingBool('community_invite_only');
            const invited = (await getSetting('invited_emails' as SettingKey)).split(',').map((x) => x.trim().toLowerCase()).includes(email);
            const role = adminEmails().includes(email) ? 'admin' : inviteOnly && !invited ? 'reader' : 'writer';
            return { data: { ...u, role, handle: handleFromEmail(email) } };
          },
        },
      },
    },
    advanced: {
      cookiePrefix: 'trutiai',
      useSecureCookies: env.SITE_URL.startsWith('https://'),
    },
  });
}

export function auth() {
  return (instance ??= build());
}

export type Auth = ReturnType<typeof auth>;
export type SessionUser = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user'];

export const ROLE_RANK: Record<string, number> = { reader: 0, writer: 1, trusted: 2, admin: 3 };

export function hasRole(user: { role?: string | null } | null | undefined, min: 'reader' | 'writer' | 'trusted' | 'admin'): boolean {
  if (!user) return false;
  return (ROLE_RANK[user.role ?? 'reader'] ?? 0) >= ROLE_RANK[min];
}

/**
 * Can this user write? Roles are set at sign-up, so a reader who joined while writing was invite-only would stay a
 * reader forever. For readers only, this re-reads the role from D1 (the session cookie may be up to 5 minutes stale
 * after an admin promotion) and re-checks the current rules: if writing is now open to all, or the admin invited
 * this email, the reader is promoted to writer on the spot (one D1 write, once).
 */
export async function canWrite(u: { id: string; email?: string | null; role?: string | null; bannedAt?: Date | null } | null | undefined): Promise<boolean> {
  if (!u || u.bannedAt) return false;
  if (hasRole(u, 'writer')) return true;
  // The session cookie caches the role for 5 minutes, so an admin promotion would not show yet: read it fresh.
  const { db, user } = await import('./db');
  const { and, eq } = await import('drizzle-orm');
  const row = await db().query.user.findFirst({ where: eq(user.id, u.id), columns: { role: true, bannedAt: true } });
  if (!row || row.bannedAt) return false;
  if (hasRole(row, 'writer')) {
    u.role = row.role;
    return true;
  }
  const email = (u.email || '').toLowerCase();
  const open = !(await getSettingBool('community_invite_only'));
  const invited = !!email && (await getSetting('invited_emails' as SettingKey)).split(',').map((x) => x.trim().toLowerCase()).includes(email);
  if (!open && !invited) return false;
  await db().update(user).set({ role: 'writer', updatedAt: new Date() }).where(and(eq(user.id, u.id), eq(user.role, 'reader')));
  u.role = 'writer';
  return true;
}
