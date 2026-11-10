import { CodeBlock } from '@/components/docs/CodeBlock';
import { CodeTabs } from '@/components/docs/CodeTabs';
import { A, C, Callout, DocPage, H2, P, Table, UL } from '@/components/docs/prose';
import { docPageMetadata } from '@/lib/seo';
import { EXAMPLE_LOOKUP_PLAYER_ID, EXAMPLE_LOOKUP_RESPONSE, EXAMPLE_LOOKUP_V1, EXAMPLE_SECRET, EXAMPLE_TIMESTAMP, json } from '@/lib/docs/examples';
import { DOCS_FACTS } from '@/lib/docs/facts';

export const metadata = docPageMetadata('player-lookup');

const RESPONSE_TS = `interface PlayerLookupResponse {
  player_id: string;     // identifiant canonique du joueur (un entier positif est accepté et converti)
  display_name: string;  // nom montré au joueur : « Est-ce bien vous : <display_name> ? »
  level?: number;        // optionnel, entier 0 à 1 000 000
  avatar_url?: string;   // optionnel, URL http(s) d'une image
}`;

const REQUEST_SAMPLE = `GET /players/${EXAMPLE_LOOKUP_PLAYER_ID} HTTP/1.1
Host: api.monjeu.com
Accept: application/json
User-Agent: DevAppStore-PlayerLookup/1.0
${DOCS_FACTS.signatureHeader}: t=${EXAMPLE_TIMESTAMP},v1=${EXAMPLE_LOOKUP_V1}`;

const NODE_IMPL = `import express from 'express';
import { verifyLookupSignature } from '@devappstore/sdk/server';

const app = express();

app.get('/players/:playerId', async (req, res) => {
  const playerId = req.params.playerId; // déjà décodé par Express
  // Chaîne signée : « devappstore-lookup-v1: » + identifiant joueur brut (jamais valable comme signature de webhook).
  if (!verifyLookupSignature(playerId, req.get('DevAppStore-Signature'), process.env.WEBHOOK_SECRET)) {
    return res.sendStatus(401);
  }
  const player = await db.players.findById(playerId);
  if (!player || player.banned) return res.sendStatus(404);
  res.json({
    player_id: player.id,
    display_name: player.nickname,
    level: player.level,
    avatar_url: player.avatarUrl ?? undefined,
  });
});`;

const PYTHON_IMPL = `import hashlib, hmac, os, time
from flask import Flask, abort, jsonify, request

SECRET = os.environ["WEBHOOK_SECRET"].encode()
app = Flask(__name__)


def signed(body: str, header: str | None) -> bool:
    parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
    try:
        t = int(parts.get("t", ""))
    except ValueError:
        return False
    if abs(time.time() - t) > 300 or "v1" not in parts:
        return False
    expected = hmac.new(SECRET, f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])


@app.get("/players/<player_id>")
def lookup(player_id: str):
    if not signed(player_id, request.headers.get("DevAppStore-Signature")):
        abort(401)
    player = find_player(player_id)
    if player is None:
        abort(404)
    return jsonify(player_id=player.id, display_name=player.nickname, level=player.level)`;

export default function PlayerLookupPage() {
  return (
    <DocPage slug="player-lookup">
      <H2 id="role">Rôle</H2>
      <P>
        Avec la méthode de liaison <A href="/docs/concepts#methode-id-confirm">id_confirm</A>, le joueur saisit son identifiant joueur
        sur Dev AppStore au lieu d’un code. Dev AppStore interroge alors <strong>votre</strong> endpoint « player lookup » pour retrouver
        le joueur et lui demander « Est-ce bien vous : NovaKnight ? ». Aucune interface n’est nécessaire dans le jeu.
      </P>
      <P>
        Configurez l’URL dans l’onglet <strong>Intégration</strong> du jeu (réglages de liaison). Elle doit contenir le marqueur{' '}
        <C>{'{player_id}'}</C>, par exemple <C>{'https://api.monjeu.com/players/{player_id}'}</C>. Sans URL valide, la méthode n’est pas
        proposée aux joueurs.
      </P>

      <H2 id="appel">Appel reçu</H2>
      <UL>
        <li>
          Méthode <C>GET</C>, sans corps. <C>{'{player_id}'}</C> est remplacé par l’identifiant saisi, encodé pour une URL (
          <C>encodeURIComponent</C>).
        </li>
        <li>
          L’identifiant saisi fait 1 à 64 caractères, sans caractère de contrôle (espaces de début/fin retirés).
        </li>
      </UL>
      <CodeBlock lang="http" title="Exemple de requête" code={REQUEST_SAMPLE} />

      <H2 id="signature-lookup">Signature</H2>
      <P>
        L’appel est signé avec le <strong>secret webhook du jeu</strong> et le même algorithme que les{' '}
        <A href="/docs/webhooks#signature">webhooks</A> : <C>{'DevAppStore-Signature: t=<t>,v1=<hmac>'}</C>, où <C>v1</C> est le HMAC-SHA256
        hexadécimal de <C>{'`${t}.devappstore-lookup-v1:${player_id}`'}</C> : le préfixe suivi de l’<strong>identifiant joueur brut</strong>{' '}
        (non encodé), tel que vous le lisez après décodage de l’URL. Le préfixe garantit qu’une signature de lookup ne peut jamais servir de
        signature de webhook. SDK : <C>verifyLookupSignature(playerId, header, secret)</C>. Même tolérance de {DOCS_FACTS.toleranceS} secondes ;
        pendant une rotation du secret, l’en-tête porte deux <C>v1</C> (24 h).
      </P>
      <Table
        caption="Vecteur de test (player lookup)"
        head={['Donnée', 'Valeur']}
        rows={[
          ['Secret', <C key="v">{EXAMPLE_SECRET}</C>],
          ['t', <C key="v">{EXAMPLE_TIMESTAMP}</C>],
          ['Chaîne signée', <C key="v">{`devappstore-lookup-v1:${EXAMPLE_LOOKUP_PLAYER_ID}`}</C>],
          ['v1 attendu', <C key="v">{EXAMPLE_LOOKUP_V1}</C>],
        ]}
      />
      <P>
        Refusez (<C>401</C>) toute requête mal signée : sans cela, n’importe qui pourrait énumérer vos joueurs.
      </P>

      <H2 id="reponse">Réponse PlayerLookupResponse</H2>
      <Table
        caption="Codes de réponse attendus"
        head={['Votre réponse', 'Ce que voit le joueur']}
        rows={[
          [<>200 + JSON valide</>, '« Est-ce bien vous : <display_name> ? » avec, si fournis, niveau et avatar'],
          [<C key="a">404</C>, 'Aucun joueur ne correspond à cet identifiant.'],
          [<>Autre statut, délai dépassé</>, 'Le serveur du jeu ne répond pas / a répondu une erreur. Réessayez plus tard.'],
          [<>200 + JSON invalide</>, 'Réponse inattendue du serveur du jeu.'],
        ]}
      />
      <CodeTabs
        ariaLabel="Réponse"
        tabs={[
          { label: 'Exemple JSON', code: json(EXAMPLE_LOOKUP_RESPONSE) },
          { label: 'TypeScript', code: RESPONSE_TS },
        ]}
      />
      <UL>
        <li>
          <C>player_id</C> (requis, 1 à 128 caractères) : identifiant <strong>canonique</strong> qui sera enregistré dans la liaison et
          renvoyé dans chaque achat. Vous pouvez normaliser la saisie (casse, préfixe…).
        </li>
        <li>
          <C>display_name</C> (requis, 1 à 100 caractères).
        </li>
        <li>
          <C>level</C> et <C>avatar_url</C> sont optionnels : une valeur invalide est simplement ignorée.
        </li>
        <li>N’exposez aucune donnée personnelle (e-mail, nom réel) : le nom affiché suffit.</li>
      </UL>

      <H2 id="exemple-lookup">Exemple d’implémentation</H2>
      <CodeTabs
        tabs={[
          { label: 'Node', title: 'Express', code: NODE_IMPL },
          { label: 'Python', title: 'Flask', code: PYTHON_IMPL },
        ]}
      />

      <H2 id="contraintes">Contraintes et sécurité</H2>
      <UL>
        <li>
          Répondez en moins de <strong>{DOCS_FACTS.lookupTimeoutS} secondes</strong> ; réponse limitée à {DOCS_FACTS.lookupMaxKb} Ko.
        </li>
        <li>
          L’URL doit être publique : les adresses privées, locales ou réservées sont refusées en production (protection SSRF). Les
          redirections ne sont pas suivies.
        </li>
        <li>
          Chaque joueur est limité à {DOCS_FACTS.lookupsPerUser} recherches par {DOCS_FACTS.lookupsWindowMin} minutes ; ajoutez votre
          propre limitation si besoin.
        </li>
        <li>
          Le lien créé est <strong>déclaratif</strong> : ne l’utilisez pas seul pour des objets de grande valeur ou échangeables.
        </li>
      </UL>
      <Callout kind="tip">
        <p>
          Renvoyez <C>404</C> pour les comptes bannis ou supprimés : le joueur ne pourra pas s’y lier.
        </p>
      </Callout>
    </DocPage>
  );
}
