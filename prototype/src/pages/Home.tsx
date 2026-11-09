import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createApp, resetDemo, useDB } from '../lib/store';
import { PLATFORM_FEE, STORE_FEE } from '../lib/constants';
import { money } from '../lib/format';
import { IconPlus } from '../components/Icons';
import { ItemCard } from '../components/ItemCard';

export function Home() {
  const db = useDB();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').toLowerCase();
  const cat = params.get('cat') ?? 'all';

  const since = Date.now() - 30 * 86400000;
  const revenue = useMemo(() => {
    const m = new Map<string, number>();
    db.orders.filter((o) => o.createdAt >= since).forEach((o) => m.set(o.appId, (m.get(o.appId) ?? 0) + o.amount));
    return m;
  }, [db.orders, since]);
  const total = [...revenue.values()].reduce((a, b) => a + b, 0);
  const saved = total * (STORE_FEE - PLATFORM_FEE);

  const apps = db.apps.filter((a) => !q || cat === 'items' ? !q || false : (a.name + a.publisher).toLowerCase().includes(q));
  const items = q && cat !== 'apps'
    ? db.apps.flatMap((a) => a.items.filter((i) => (i.title + i.subtitle + i.keywords.join(' ')).toLowerCase().includes(q)).map((i) => ({ app: a, item: i })))
    : [];

  return (
    <main className="page">
      <div className="crumbs">
        <h1><Link to="/">Accueil</Link> / <span>Mes apps</span></h1>
      </div>

      {!q && (
        <section className="hero">
          <div>
            <h2>Vendez vos achats in-app sur le web.</h2>
            <p>Créez une boutique aux couleurs de votre jeu, partagez le lien à vos joueurs et gardez jusqu'à {Math.round((1 - PLATFORM_FEE) * 100)} % de chaque vente au lieu de {Math.round((1 - STORE_FEE) * 100)} %.</p>
          </div>
          <div className="hero-stats">
            <div><span>Revenu brut · 30 j</span><strong>{money(total)}</strong></div>
            <div className="highlight"><span>Économisé vs stores · 30 j</span><strong>+{money(saved)}</strong></div>
          </div>
        </section>
      )}

      {q && <h2 className="section-title">Résultats pour « {params.get('q')} »</h2>}

      {(cat !== 'items' || !q) && (
        <div className="app-grid">
          {(q ? apps : db.apps).map((a) => (
            <Link key={a.id} to={`/apps/${a.id}`} className="app-tile">
              <div className="tile-icon">{a.icon ? <img src={a.icon} alt="" /> : <span>{a.name[0]}</span>}</div>
              <strong>{a.name}</strong>
              <span className="muted">{a.publisher}</span>
              <span className="tile-foot">
                <span>{a.items.length} article{a.items.length > 1 ? 's' : ''}</span>
                <span>{money(revenue.get(a.id) ?? 0, a.currency)} · 30 j</span>
              </span>
            </Link>
          ))}
          {!q && (
            <button className="app-tile new" onClick={() => nav(`/apps/${createApp().id}`)}>
              <span className="tile-plus"><IconPlus size={26} /></span>
              <strong>Nouvelle app</strong>
              <span className="muted">Créer une boutique</span>
            </button>
          )}
        </div>
      )}

      {q && items.length > 0 && (
        <div className="search-items">
          {items.map(({ app, item }) => (
            <div key={item.id} className="search-item">
              <ItemCard item={item} grid={{ width: 150, height: 200 }} currency={app.currency} onClick={() => nav(`/apps/${app.id}`)} label={item.title} />
              <span className="muted small">{app.name}</span>
            </div>
          ))}
        </div>
      )}
      {q && !items.length && !apps.length && <p className="muted">Aucun résultat.</p>}

      {!q && (
        <p className="muted small reset">
          Prototype : les données sont enregistrées dans ce navigateur.{' '}
          <button className="link-btn" onClick={() => confirm('Réinitialiser les données de démo ?') && resetDemo()}>Réinitialiser la démo</button>
        </p>
      )}
    </main>
  );
}
