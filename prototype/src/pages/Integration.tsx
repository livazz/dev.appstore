import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { updateApp, useApp } from '../lib/store';
import { randomKey } from '../lib/format';
import { IconCopy } from '../components/Icons';

function Copy({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      aria-label="Copier"
    >
      <IconCopy size={15} /> {ok ? 'Copié' : 'Copier'}
    </button>
  );
}

function Secret({ value, onRegen }: { value: string; onRegen: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="key-row">
      <code>{show ? value : value.slice(0, 10) + '•'.repeat(18)}</code>
      <button className="link-btn" onClick={() => setShow((s) => !s)}>{show ? 'Masquer' : 'Afficher'}</button>
      <Copy text={value} />
      <button className="link-btn danger" onClick={() => confirm('Régénérer ? L\'ancienne clé cessera de fonctionner.') && onRegen()}>Régénérer</button>
    </div>
  );
}

export function Integration() {
  const { appId } = useParams();
  const app = useApp(appId)!;
  const [url, setUrl] = useState(app.webhookUrl);
  const storeUrl = `${location.origin}${location.pathname}#/store/${app.id}`;
  const sample = app.items[0];

  const payload = JSON.stringify(
    {
      event: 'purchase.completed',
      order_id: 'ord_8f2k1x0a',
      app_id: app.id,
      player_id: '#2PP8QL9',
      product_id: sample?.productId ?? 'gems_1200',
      type: sample?.type ?? 'consumable',
      amount: sample?.price ?? 7.99,
      currency: app.currency,
      created_at: new Date().toISOString(),
    },
    null,
    2,
  );

  const server = `// Exemple Node.js / Express — votre serveur de jeu
import express from 'express';
import crypto from 'node:crypto';

const app = express();
const SECRET = process.env.WOLLEEN_WEBHOOK_SECRET; // ${app.webhookSecret.slice(0, 8)}…

app.post('/wolleen/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // 1. Vérifier la signature HMAC-SHA256
  const expected = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');
  const received = req.get('Wolleen-Signature') ?? '';
  if (expected.length !== received.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return res.status(401).end();
  }

  // 2. Créditer le joueur (idempotent grâce à order_id)
  const evt = JSON.parse(req.body);
  if (evt.event === 'purchase.completed') {
    await grantProduct(evt.player_id, evt.product_id, evt.order_id);
  }
  res.status(200).json({ received: true });
});`;

  return (
    <section className="integration">
      <div className="card">
        <h3>1. Partagez le lien de votre boutique</h3>
        <p className="muted">Ajoutez un bouton « Boutique web » dans votre jeu qui ouvre ce lien. Passez l'identifiant du joueur en paramètre pour qu'il n'ait rien à saisir.</p>
        <div className="key-row">
          <code>{storeUrl}?player=&#123;PLAYER_ID&#125;</code>
          <Copy text={`${storeUrl}?player={PLAYER_ID}`} />
          <a className="link-btn" href={`#/store/${app.id}?player=%232PP8QL9`} target="_blank" rel="noreferrer">Tester</a>
        </div>
      </div>

      <div className="card">
        <h3>2. Recevez les achats sur votre serveur</h3>
        <p className="muted">À chaque paiement réussi, Wolleen envoie un événement signé à votre URL. Tant qu'aucune URL n'est configurée, l'app apparaît comme « Non liée ».</p>
        <form
          className="key-row"
          onSubmit={(e) => {
            e.preventDefault();
            updateApp(app.id, { webhookUrl: url.trim() });
          }}
        >
          <input className="grow" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.monjeu.com/wolleen/webhook" aria-label="URL du webhook" />
          <button className="btn primary sm" type="submit">Enregistrer</button>
        </form>
        <h4>Secret de signature</h4>
        <Secret value={app.webhookSecret} onRegen={() => updateApp(app.id, { webhookSecret: randomKey('whsec_') })} />
        <h4>Clé API (lecture des commandes, remboursements)</h4>
        <Secret value={app.apiKey} onRegen={() => updateApp(app.id, { apiKey: randomKey('wk_live_') })} />
      </div>

      <div className="two-col">
        <div className="card">
          <div className="code-head"><h4>Événement envoyé</h4><Copy text={payload} /></div>
          <pre className="code">{payload}</pre>
        </div>
        <div className="card">
          <div className="code-head"><h4>Exemple de réception</h4><Copy text={server} /></div>
          <pre className="code">{server}</pre>
        </div>
      </div>

      <div className="card">
        <h3>Identifiants produits</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Article</th><th>product_id</th><th>Type</th></tr></thead>
            <tbody>
              {app.items.map((i) => (
                <tr key={i.id}><td>{i.title}</td><td className="mono">{i.productId}</td><td>{i.type}</td></tr>
              ))}
              {!app.items.length && <tr><td colSpan={3} className="muted">Ajoutez des articles dans l'onglet Boutique.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
