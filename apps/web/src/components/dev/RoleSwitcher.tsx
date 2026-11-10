import { getCurrentUser } from '@/server/session';
import { DEMO_ROLES, demoRoleOf, isRoleSwitcherEnabled } from '@/lib/demo-roles';
import { switchDemoRoleAction } from './role-switch-action';

/**
 * Pastille flottante « Rôle » (bas droite) pour passer d'un compte de démo à l'autre en un clic.
 * Rendue uniquement en développement ; aucun JavaScript client (formulaires + Server Action). z-40 : sous les tiroirs et
 * fenêtres (z-50), pour ne jamais masquer un bouton d'action.
 */
export async function RoleSwitcher() {
  if (!isRoleSwitcherEnabled()) return null;
  const current = demoRoleOf((await getCurrentUser())?.email);
  return (
    <details className="group fixed right-3 bottom-3 z-40 text-sm print:hidden">
      <summary
        className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full bg-ink px-3.5 py-2 font-semibold text-white shadow-lg ring-1 ring-white/20 select-none hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
        title="Changer de compte de démo (développement uniquement)"
      >
        <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
        Rôle : {DEMO_ROLES.find((r) => r.role === current)?.label ?? 'visiteur'}
        <svg viewBox="0 0 20 20" className="size-4 transition group-open:rotate-180" aria-hidden="true">
          <path d="M5 12.5 10 7.5l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute right-0 bottom-12 w-72 rounded-2xl bg-surface p-2 text-ink shadow-2xl ring-1 ring-black/10">
        <p className="px-2 pt-1 pb-2 text-xs text-ink-2">Comptes de démo — développement uniquement</p>
        {DEMO_ROLES.map((r) => (
          <form key={r.role} action={switchDemoRoleAction}>
            <input type="hidden" name="role" value={r.role} />
            <button
              type="submit"
              aria-current={current === r.role ? 'true' : undefined}
              className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-primary aria-[current=true]:bg-brand/25"
            >
              <span className="mt-0.5 grid size-8 flex-none place-items-center rounded-lg bg-ink text-xs font-bold text-white" aria-hidden="true">
                {r.label[0]}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">
                  {r.label}
                  {current === r.role ? <span className="ml-1.5 text-xs font-medium text-ink-2">(actuel)</span> : null}
                </span>
                <span className="block truncate text-xs text-ink-2">{r.hint}</span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
