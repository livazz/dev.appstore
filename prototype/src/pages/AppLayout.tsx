import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { deleteApp, useApp } from '../lib/store';
import { IconExternal, IconMore, IconPlus } from '../components/Icons';
import { ItemModal } from '../components/ItemModal';

export function AppLayout() {
  const { appId } = useParams();
  const app = useApp(appId);
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  if (!app)
    return (
      <main className="page">
        <p>Application introuvable. <Link to="/">Retour à mes apps</Link></p>
      </main>
    );

  return (
    <main className="page">
      <div className="crumbs">
        <h1>
          <Link to="/">Accueil</Link> / <Link to="/">Mes apps</Link> / <span>{app.name}</span>
        </h1>
        <button className="round-btn dark" onClick={() => { nav(`/apps/${app.id}`); setAdding(true); }} aria-label="Ajouter un article" title="Ajouter un article">
          <IconPlus size={18} />
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button className="round-btn" onClick={() => setMenu((m) => !m)} aria-label="Plus d'actions" aria-expanded={menu}>
            <IconMore size={18} />
          </button>
          {menu && (
            <div className="menu" role="menu">
              <a role="menuitem" href={`#/store/${app.id}`} target="_blank" rel="noreferrer">
                Voir la boutique publique <IconExternal size={14} />
              </a>
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  if (confirm(`Supprimer l'app « ${app.name} » et tout son historique ?`)) {
                    deleteApp(app.id);
                    nav('/');
                  }
                }}
              >
                Supprimer l'app
              </button>
            </div>
          )}
        </div>
      </div>
      <nav className="tabs" aria-label="Sections de l'app">
        <NavLink end to={`/apps/${app.id}`}>Boutique</NavLink>
        <NavLink to={`/apps/${app.id}/sales`}>Ventes et tendances</NavLink>
        <NavLink to={`/apps/${app.id}/integration`}>Intégration</NavLink>
      </nav>
      <Outlet />
      {adding && <ItemModal app={app} onClose={() => setAdding(false)} />}
    </main>
  );
}
