/*
 * Back-office Dev AppStore : donne un rôle de la plateforme à un compte existant (idempotent).
 * `npm run db:seed` fait déjà de dev@wolleen.test un superadmin (seed.ts) ; ce script sert pour un autre compte ou un
 * autre rôle : `npx tsx packages/db/src/seed-admin.ts autre@exemple.fr support`.
 */
import { db, eq, platformAdmins, user, type PlatformAdminRole } from './index';

const ROLES: PlatformAdminRole[] = ['superadmin', 'support', 'finance'];

export async function seedAdmin(email = 'dev@wolleen.test', role: PlatformAdminRole = 'superadmin') {
  if (!ROLES.includes(role)) throw new Error(`Rôle inconnu : ${role} (attendu : ${ROLES.join(', ')})`);
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.toLowerCase()));
  if (!u) throw new Error(`Utilisateur introuvable : ${email} (lancez d'abord npm run db:seed)`);
  await db.insert(platformAdmins).values({ userId: u.id, role }).onConflictDoUpdate({ target: platformAdmins.userId, set: { role } });
  return { userId: u.id, email, role };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin(process.argv[2], (process.argv[3] as PlatformAdminRole | undefined) ?? 'superadmin')
    .then((r) => {
      console.log(`Seed administration : ${r.email} (${r.userId}) est ${r.role} de Dev AppStore — back-office sur /admin`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
