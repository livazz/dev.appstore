import type { Metadata } from 'next';
import { RankingsView } from '@/components/catalog/RankingsView';
import { openGraph } from '@/lib/seo';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ cat?: string | string[] }> };

export const metadata: Metadata = {
  title: 'Classements : Top 100 mobile',
  description: 'Les jeux mobiles les plus achetés sur Dev AppStore ces 30 derniers jours.',
  alternates: { canonical: '/classements' },
  openGraph: openGraph({ url: '/classements' }),
};

/** /classements = onglet Top 100 mobile. */
export default async function RankingsHome({ searchParams }: Props) {
  const sp = await searchParams;
  return <RankingsView tab="mobile" cat={Array.isArray(sp.cat) ? sp.cat[0] : sp.cat} />;
}
