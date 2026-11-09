import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { App, StoreItem } from '../types';
import { addOrder, useApp } from '../lib/store';
import { money, periodSuffix, uid } from '../lib/format';
import { ITEM_TYPES } from '../lib/constants';
import { StorePanel } from '../components/StorePanel';
import { Modal } from '../components/Modal';
import { ItemCard } from '../components/ItemCard';
import { IconCheck, IconLock } from '../components/Icons';

function Checkout({ app, item, playerParam, onClose }: { app: App; item: StoreItem; playerParam: string; onClose: () => void }) {
  const [player, setPlayer] = useState(playerParam);
  const [email, setEmail] = useState('');
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [exp, setExp] = useState('12/30');
  const [cvc, setCvc] = useState('123');
  const [step, setStep] = useState<'form' | 'paying' | 'done'>('form');
  const [orderId, setOrderId] = useState('');
  const [err, setErr] = useState('');

  const pay = () => {
    if (!player.trim()) return setErr('Indiquez votre identifiant joueur pour recevoir l\'article.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Adresse e-mail invalide.');
    if (card.replace(/\s/g, '').length < 12) return setErr('Numéro de carte invalide.');
    setErr('');
    setStep('paying');
    setTimeout(() => {
      const id = uid('ord_');
      addOrder({
        id,
        appId: app.id,
        itemId: item.id,
        itemTitle: item.title,
        productId: item.productId,
        amount: item.price,
        currency: app.currency,
        playerId: player.trim(),
        email,
        status: app.webhookUrl ? 'delivered' : 'paid',
        createdAt: Date.now(),
      });
      setOrderId(id);
      setStep('done');
    }, 1200);
  };

  const type = ITEM_TYPES.find((t) => t.value === item.type)?.label;

  return (
    <Modal onClose={onClose} label="Paiement">
      {step === 'done' ? (
        <div className="checkout-done">
          <span className="done-check"><IconCheck size={34} /></span>
          <h2>Merci pour votre achat !</h2>
          <p>
            <strong>{item.title}</strong> sera crédité sur le compte <strong>{player}</strong> à votre prochaine connexion dans {app.name}.
          </p>
          <p className="muted">Commande {orderId} · reçu envoyé à {email}</p>
          <button className="btn primary" onClick={onClose}>Retour à la boutique</button>
        </div>
      ) : (
        <div className="checkout">
          <div className="checkout-item">
            <ItemCard item={item} grid={{ width: 150, height: 200 }} currency={app.currency} />
            <div>
              <h2>{item.title}</h2>
              {item.subtitle && <p>{item.subtitle}</p>}
              <p className="muted">{type}</p>
              {item.models.length > 1 && (
                <div className="model-thumbs">
                  {item.models.map((m, i) => (m.image ? <img key={i} src={m.image} alt={m.label} title={m.label} /> : null))}
                </div>
              )}
              <p className="checkout-price">
                {item.oldPrice ? <s>{money(item.oldPrice, app.currency)}</s> : null} {money(item.price, app.currency)}
                <small>{periodSuffix(item)}</small>
              </p>
            </div>
          </div>
          <div className="demo-banner">Mode démo — aucun paiement réel n'est effectué.</div>
          <div className="form-grid">
            <label className="field span2">
              <span>Identifiant joueur</span>
              <input value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="#2PP8QL9" readOnly={!!playerParam} />
            </label>
            <label className="field span2">
              <span>E-mail (pour le reçu)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" />
            </label>
            <label className="field span2">
              <span>Carte bancaire</span>
              <input value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" />
            </label>
            <label className="field">
              <span>Expiration</span>
              <input value={exp} onChange={(e) => setExp(e.target.value)} />
            </label>
            <label className="field">
              <span>CVC</span>
              <input value={cvc} onChange={(e) => setCvc(e.target.value)} />
            </label>
          </div>
          {err && <p className="form-error">{err}</p>}
          <button className="btn primary block" onClick={pay} disabled={step === 'paying'}>
            <IconLock size={16} /> {step === 'paying' ? 'Paiement en cours…' : `Payer ${money(item.price, app.currency)}`}
          </button>
          <p className="muted small center">Paiement sécurisé · Vendu par {app.publisher} via Wolleen</p>
        </div>
      )}
    </Modal>
  );
}

export function Storefront() {
  const { appId } = useParams();
  const [params] = useSearchParams();
  const app = useApp(appId);
  const [buying, setBuying] = useState<StoreItem | null>(null);
  const player = params.get('player') ?? '';

  if (!app) return <main className="page"><p>Boutique introuvable.</p></main>;

  return (
    <div className="storefront">
      <header className="store-top">
        <div className="store-top-inner">
          {app.icon && <img src={app.icon} alt="" className="mini-icon" />}
          <strong>Boutique officielle {app.name}</strong>
          <span className="spacer" />
          {player ? <span className="player-chip">Joueur {player}</span> : null}
        </div>
      </header>
      <main className="page">
        <StorePanel
          app={app}
          headerSlot={
            <>
              <div className="app-icon">{app.icon ? <img src={app.icon} alt="" /> : null}</div>
              <div className="app-meta">
                <h1 className="app-name static">{app.name}</h1>
                <p>{app.subtitle}</p>
                <p>{app.publisher}</p>
                <span className="status ok"><i />Meilleurs prix qu'en jeu</span>
              </div>
            </>
          }
          onItemClick={setBuying}
          emptyText="La boutique ouvre bientôt."
        />
        <footer className="store-foot">Propulsé par <strong>Wolleen</strong> · Les achats sont crédités directement sur votre compte de jeu.</footer>
      </main>
      {buying && <Checkout app={app} item={buying} playerParam={player} onClose={() => setBuying(null)} />}
    </div>
  );
}
