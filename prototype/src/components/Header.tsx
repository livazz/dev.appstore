import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { IconSearch } from './Icons';

export function Header() {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cat, setCat] = useState(params.get('cat') ?? 'all');
  const nav = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (cat !== 'all') sp.set('cat', cat);
    nav(`/?${sp.toString()}`);
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="logo" aria-label="Wolleen — accueil">W</Link>
        <form className="search" onSubmit={submit} role="search">
          <IconSearch size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie">
            <option value="all">Toutes catégories</option>
            <option value="apps">Apps</option>
            <option value="items">Articles</option>
          </select>
        </form>
        <div className="user">
          <span className="avatar">
            MS
            <i className="online" />
          </span>
          <span className="user-name">Mon studio</span>
        </div>
      </div>
    </header>
  );
}
