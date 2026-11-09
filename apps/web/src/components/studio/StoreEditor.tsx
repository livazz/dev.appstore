'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { GRID_LIMITS, type GameTheme } from '@devappstore/core';
import { StorePanel, type PanelItem } from '@/components/store/StorePanel';
import { safeImageUrl } from '@/components/store/style-safety';
import { moveItem, updateGame } from '@/server/studio';
import { GAME_STATUS_LABELS, type EditorGame, type EditorItem } from '@/lib/studio-types';
import { pickAndUploadImage } from '@/lib/upload';
import { GradientPicker } from './GradientPicker';
import { ItemModal } from './ItemModal';
import { Slider } from './Controls';
import { IconArrowLeft, IconArrowRight, IconClose, IconEdit, IconGradient, IconPlus } from './icons';

type Patch = Partial<Pick<EditorGame, 'name' | 'subtitle' | 'publisherName' | 'iconUrl' | 'bannerUrl' | 'theme'>>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function InlineEdit({
  value,
  onSave,
  label,
  big,
  placeholder,
  maxLength,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  big?: boolean;
  placeholder?: string;
  maxLength: number;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const text = big ? 'text-2xl font-bold sm:text-3xl' : 'text-sm text-ink-2';
  if (editing)
    return (
      <input
        className={`${text} w-full max-w-md rounded-md border border-primary bg-white/90 px-2 py-0.5 text-ink outline-none ring-2 ring-primary/25`}
        value={v}
        autoFocus
        aria-label={label}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const next = v.trim();
          // Le nom est obligatoire ; les autres champs peuvent être vidés.
          if (big && !next) setV(value);
          else if (next !== value) onSave(next);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setV(value);
            setEditing(false);
          }
        }}
      />
    );
  return (
    <button
      type="button"
      className={`${text} group inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 py-0.5 text-left hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary`}
      onClick={() => {
        setV(value);
        setEditing(true);
      }}
      title={`Modifier : ${label}`}
    >
      <span className={`truncate ${value ? '' : 'text-ink-2 italic'}`}>{value || placeholder}</span>
      <span className="flex-none opacity-60 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true">
        <IconEdit size={big ? 20 : 14} />
      </span>
    </button>
  );
}

const toolBtn =
  'absolute z-10 flex size-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-md ring-1 ring-black/10 hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60';

export function StoreEditor({ initialGame, initialItems }: { initialGame: EditorGame; initialItems: EditorItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [game, setGame] = useState(initialGame);
  const [items, setItems] = useState(initialItems);
  const [gradOpen, setGradOpen] = useState(false);
  const [editing, setEditing] = useState<EditorItem | null>(null);
  const [save, setSave] = useState<{ state: SaveState; error?: string }>({ state: 'idle' });
  const [uploading, setUploading] = useState<'icon' | 'banner' | null>(null);
  const [, startTransition] = useTransition();
  const adding = searchParams.get('new') === '1';

  /* ---------- Persistance des infos du jeu ---------- */
  const persist = useCallback(
    async (patch: Patch) => {
      setSave({ state: 'saving' });
      const r = await updateGame(game.id, patch);
      setSave(r.ok ? { state: 'saved' } : { state: 'error', error: r.error });
    },
    [game.id],
  );

  const set = (patch: Patch) => {
    setGame((g) => ({ ...g, ...patch }));
    void persist(patch);
  };

  // Les curseurs et le dégradé changent en continu : on regroupe les enregistrements du thème.
  const themeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTheme = useRef<GameTheme | null>(null);
  const flushTheme = useCallback(() => {
    if (themeTimer.current) clearTimeout(themeTimer.current);
    themeTimer.current = null;
    const theme = pendingTheme.current;
    pendingTheme.current = null;
    if (theme) void persist({ theme });
  }, [persist]);
  const setTheme = (theme: GameTheme) => {
    setGame((g) => ({ ...g, theme }));
    pendingTheme.current = theme;
    setSave({ state: 'saving' });
    if (themeTimer.current) clearTimeout(themeTimer.current);
    themeTimer.current = setTimeout(flushTheme, 450);
  };
  useEffect(() => flushTheme, [flushTheme]);

  const upload = async (kind: 'icon' | 'banner') => {
    setUploading(kind);
    try {
      const url = await pickAndUploadImage(kind);
      if (url) set(kind === 'icon' ? { iconUrl: url } : { bannerUrl: url });
    } catch (e) {
      setSave({ state: 'error', error: (e as Error).message });
    } finally {
      setUploading(null);
    }
  };

  /* ---------- Articles ---------- */
  const closeAdd = () => router.replace(pathname, { scroll: false });
  const openAdd = () => router.replace(`${pathname}?new=1`, { scroll: false });

  const onSaved = (it: EditorItem) =>
    setItems((list) => (list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it]));
  const onDeleted = (id: string) => setItems((list) => list.filter((x) => x.id !== id));

  const move = (id: string, direction: 'up' | 'down') => {
    const before = items;
    const idx = before.findIndex((x) => x.id === id);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= before.length) return;
    const next = [...before];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setItems(next);
    setSave({ state: 'saving' });
    startTransition(async () => {
      const r = await moveItem(game.id, id, direction);
      if (!r.ok) {
        setItems(before);
        setSave({ state: 'error', error: r.error });
      } else setSave({ state: 'saved' });
    });
  };

  /* ---------- Slots du StorePanel ---------- */
  const bannerTools = (
    <>
      <button type="button" className={`${toolBtn} top-3 left-3`} onClick={() => setGradOpen((o) => !o)} title="Dégradé de fond" aria-label="Dégradé de fond" aria-expanded={gradOpen}>
        <IconGradient size={22} />
      </button>
      <button
        type="button"
        className={`${toolBtn} top-3 right-3`}
        onClick={() => upload('banner')}
        disabled={uploading !== null}
        title="Changer la bannière"
        aria-label="Changer la bannière"
      >
        {uploading === 'banner' ? <span className="size-4 animate-spin rounded-full border-2 border-ink border-t-transparent" /> : <IconEdit size={22} />}
      </button>
      {game.bannerUrl ? (
        <button
          type="button"
          className={`${toolBtn} top-16 right-3 text-danger`}
          onClick={() => set({ bannerUrl: null })}
          title="Retirer la bannière"
          aria-label="Retirer la bannière"
        >
          <IconClose size={16} />
        </button>
      ) : (
        <p className="max-w-md px-16 text-center text-sm text-ink-2">
          Bannière du jeu — PNG transparent conseillé (1600×400). Avec un fond transparent, choisissez deux couleurs pour générer un dégradé.
        </p>
      )}
      {gradOpen && <GradientPicker value={game.theme.gradient} onChange={(g) => setTheme({ ...game.theme, gradient: g })} onClose={() => setGradOpen(false)} />}
    </>
  );

  const header = (
    <>
      <button
        type="button"
        onClick={() => upload('icon')}
        disabled={uploading !== null}
        aria-label="Changer l'icône (300×300)"
        title="Icône 300×300, affichée en 120×120"
        className="group relative size-[120px] flex-none overflow-hidden rounded-[26px] bg-white shadow-md ring-1 ring-black/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {safeImageUrl(game.iconUrl) ? <img src={safeImageUrl(game.iconUrl)!} alt="" className="size-full object-cover" /> : <span className="text-4xl font-bold text-ink-2">{game.name[0]}</span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {uploading === 'icon' ? <span className="size-6 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <IconEdit size={30} />}
        </span>
      </button>
      <div className="flex min-w-0 flex-col items-start gap-0.5">
        <InlineEdit big value={game.name} onSave={(v) => set({ name: v })} label="Nom du jeu" maxLength={60} />
        <InlineEdit value={game.subtitle} onSave={(v) => set({ subtitle: v })} label="Sous-titre" placeholder="Ajouter un sous-titre" maxLength={100} />
        <InlineEdit value={game.publisherName} onSave={(v) => set({ publisherName: v })} label="Éditeur" placeholder="Nom de l'éditeur" maxLength={60} />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-2 text-xs font-medium">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${initialGame.status === 'live' ? 'bg-ok/15 text-[color-mix(in_srgb,var(--ok)_60%,black)]' : 'bg-black/5 text-ink-2'}`}>
            <i className={`size-1.5 rounded-full ${initialGame.status === 'live' ? 'bg-ok' : 'bg-ink-3'}`} />
            {GAME_STATUS_LABELS[initialGame.status]}
          </span>
          {game.webhookConfigured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-2 py-0.5 text-[color-mix(in_srgb,var(--ok)_60%,black)]">
              <i className="size-1.5 rounded-full bg-ok" />
              Liée au jeu
            </span>
          ) : (
            <Link href={`/studio/games/${game.id}/integration`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-[color-mix(in_srgb,var(--warn)_55%,black)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary">
              <i className="size-1.5 rounded-full bg-warn" />
              Webhook non configuré — Intégration
            </Link>
          )}
        </div>
      </div>
    </>
  );

  const side = (
    <div className="rounded-xl bg-white/85 p-3 shadow-sm ring-1 ring-black/5">
      <Slider label="Hauteur" value={game.theme.grid.height} {...GRID_LIMITS.height} onChange={(v) => setTheme({ ...game.theme, grid: { ...game.theme.grid, height: v } })} />
      <Slider label="Largeur" value={game.theme.grid.width} {...GRID_LIMITS.width} onChange={(v) => setTheme({ ...game.theme, grid: { ...game.theme.grid, width: v } })} />
      <Slider label="Marge" value={game.theme.grid.margin} {...GRID_LIMITS.margin} onChange={(v) => setTheme({ ...game.theme, grid: { ...game.theme.grid, margin: v } })} />
    </div>
  );

  const addTile = (
    <button
      type="button"
      onClick={openAdd}
      aria-label="Ajouter un article"
      className="flex max-w-full flex-none items-center justify-center rounded-2xl border-2 border-dashed border-black/25 bg-white/50 text-ink-2 transition hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      style={{ width: game.theme.grid.width, height: game.theme.grid.height }}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-white shadow">
        <IconPlus size={22} />
      </span>
    </button>
  );

  const arrowBtn =
    'flex size-9 items-center justify-center rounded-full bg-white text-ink shadow ring-1 ring-black/10 hover:bg-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-30 [@media(hover:none)]:size-11';
  const itemTools = (item: PanelItem, index: number) => (
    <div className="pointer-events-none absolute -top-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 opacity-0 transition [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 [div:hover>&]:pointer-events-auto [div:hover>&]:opacity-100 [div:focus-within>&]:pointer-events-auto [div:focus-within>&]:opacity-100">
      <button type="button" className={arrowBtn} disabled={index <= 0} onClick={() => move(item.id, 'up')} aria-label={`Monter « ${item.title} »`} title="Monter (avant)">
        <IconArrowLeft size={16} />
      </button>
      <button type="button" className={arrowBtn} disabled={index >= items.length - 1} onClick={() => move(item.id, 'down')} aria-label={`Descendre « ${item.title} »`} title="Descendre (après)">
        <IconArrowRight size={16} />
      </button>
    </div>
  );

  return (
    <>
      <div className="mb-3 flex min-h-6 items-center justify-end text-xs" aria-live="polite">
        {save.state === 'saving' && <span className="text-ink-2">Enregistrement…</span>}
        {save.state === 'saved' && <span className="text-[color-mix(in_srgb,var(--ok)_60%,black)]">Modifications enregistrées</span>}
        {save.state === 'error' && <span className="rounded-md bg-danger/10 px-2 py-1 text-danger">{save.error}</span>}
      </div>
      <StorePanel
        theme={game.theme}
        currency={game.currency}
        bannerUrl={game.bannerUrl}
        items={items}
        header={header}
        bannerTools={bannerTools}
        side={side}
        addTile={addTile}
        itemTools={itemTools}
        onItemClick={(it) => setEditing(items.find((x) => x.id === it.id) ?? null)}
      />
      {editing && (
        <ItemModal gameId={game.id} currency={game.currency} items={items} item={editing} onClose={() => setEditing(null)} onSaved={onSaved} onDeleted={onDeleted} />
      )}
      {adding && <ItemModal gameId={game.id} currency={game.currency} items={items} onClose={closeAdd} onSaved={onSaved} onDeleted={onDeleted} />}
    </>
  );
}
