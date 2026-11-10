import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseRankingTab, RANKING_TABS, RankingsView } from '@/components/catalog/RankingsView';
import { openGraph } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ onglet: string }>; searchParams: Promise<{ cat?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseRankingTab((await params).onglet);
  const tab = RANKING_TABS.find((t) => t.id === id);
  if (!tab) return {};
  return {
    title: `Classements : ${tab.label}`,
    description: `${tab.title} sur Dev AppStore, d’après les achats des 30 derniers jours.`,
    alternates: { canonical: tab.href },
    openGraph: openGraph({ url: tab.href }),
  };
}

/** /classements/mobile, /classements/pc, /classements/achats (?cat= pour filtrer par catégorie). */
export default async function RankingTabPage({ params, searchParams }: Props) {
  const tab = parseRankingTab((await params).onglet);
  if (!tab) notFound();
  const sp = await searchParams;
  return <RankingsView tab={tab} cat={Array.isArray(sp.cat) ? sp.cat[0] : sp.cat} />;
}
