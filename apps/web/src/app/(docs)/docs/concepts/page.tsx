import { CodeBlock } from '@/components/docs/CodeBlock';
import { A, C, Callout, DocPage, H2, H3, P, Table, UL } from '@/components/docs/prose';
import { docPageMetadata } from '@/lib/seo';
import { EXAMPLE_REFUND, json } from '@/lib/docs/examples';
import { DOCS_FACTS, RETRY_SCHEDULE_TEXT } from '@/lib/docs/facts';

export const metadata = docPageMetadata('concepts');

const STATUS_DIAGRAM = `             webhook 2xx, ou SDK a récupéré
  pending ───────────────────────────────▶ delivered
     │  ╲                                      │
     │   ╲  ack (SDK ou serveur)               │ ack
     │    ╲                                    ▼
     │     ╰────────────────────────────▶ acknowledged
     │
     │ planning de relances épuisé
     ▼
  failed ── relance manuelle (studio) ──▶ pending`;

export default function ConceptsPage() {
  return (
    <DocPage slug="concepts">
      <H2 id="liaison">Liaison de compte</H2>
      <P>
        Un achat Dev AppStore doit arriver sur le bon compte <em>dans votre jeu</em>. La liaison associe, une fois pour toutes, le compte
        Dev AppStore du joueur à son identifiant joueur chez vous (<C>player_id</C>, une chaîne que vous choisissez). Le joueur peut
        consulter et délier ses jeux depuis son compte. Si le joueur n’est pas encore lié au moment d’acheter, il est d’abord envoyé sur
        la page de liaison, puis revient à son achat.
      </P>
      <P>
        Vous choisissez les méthodes proposées dans l’onglet <strong>Intégration</strong> du jeu. Seules les méthodes activées (et
        configurées) sont montrées au joueur.
      </P>
      <Table
        caption="Méthodes de liaison"
        head={['Méthode', 'Ce que fait le joueur', 'Ce que fait le jeu', 'Fiabilité']}
        rows={[
          [<C key="c">code</C>, 'Saisit le code affiché dans le jeu', <>Appelle <C>POST /api/v1/link-codes</C> et affiche le code</>, 'Vérifiée'],
          [<C key="i">id_confirm</C>, 'Saisit son identifiant joueur, confirme « Est-ce bien vous ? »', 'Expose un endpoint « player lookup »', 'Déclarative'],
          [<C key="o">oauth</C>, 'Se connecte à son compte de jeu', '—', 'À venir'],
        ]}
      />

      <H3 id="methode-code">Méthode « code »</H3>
      <UL>
        <li>
          Votre jeu (serveur ou SDK) appelle <A href="/docs/api#post-link-codes">POST /api/v1/link-codes</A> avec le <C>player_id</C> du
          joueur connecté et reçoit un code lisible de 8 caractères, par ex. <C>K7QF-M2XA</C> (sans 0/O/1/I pour éviter les confusions).
        </li>
        <li>
          Le code est valable <strong>{DOCS_FACTS.linkCodeTtlMin} minutes</strong>, à <strong>usage unique</strong>, et seulement pour
          votre jeu. Demander un nouveau code invalide le précédent du même joueur.
        </li>
        <li>
          Le joueur le saisit sur la page de liaison du jeu (<C>/games/&lt;slug&gt;/link</C>). Les saisies erronées sont limitées par
          utilisateur pour empêcher de deviner un code.
        </li>
        <li>C’est la méthode recommandée : la preuve de possession du compte vient de votre jeu.</li>
      </UL>

      <H3 id="methode-id-confirm">Méthode « id_confirm »</H3>
      <UL>
        <li>
          Le joueur saisit son identifiant joueur. Dev AppStore appelle votre{' '}
          <A href="/docs/player-lookup">endpoint player lookup</A> (requête signée) et affiche « Est-ce bien vous : NovaKnight ? ».
        </li>
        <li>
          S’il confirme (dans les 10 minutes), le lien est créé comme <strong>déclaratif</strong> (non vérifié) : rien ne prouve que le
          joueur possède ce compte. En contrepartie, aucune interface n’est nécessaire dans le jeu.
        </li>
        <li>
          Les recherches sont limitées à {DOCS_FACTS.lookupsPerUser} par utilisateur et par {DOCS_FACTS.lookupsWindowMin} minutes,
          pour protéger votre serveur et empêcher l’énumération de vos joueurs.
        </li>
      </UL>
      <Callout kind="warn">
        <p>
          Avec <C>id_confirm</C>, un joueur peut se tromper d’identifiant (ou saisir celui d’un autre) et lui offrir un achat. N’utilisez
          pas cette méthode pour des objets échangeables entre joueurs ou de grande valeur, ou combinez-la avec <C>code</C>.
        </p>
      </Callout>

      <H3 id="methode-oauth">Méthode « oauth » (à venir)</H3>
      <P>
        La connexion directe au compte du jeu (OAuth 2.0 côté studio) est prévue dans une prochaine version. Même activée, elle n’est
        pas encore proposée aux joueurs : prévoyez <C>code</C> ou <C>id_confirm</C> en attendant.
      </P>

      <H2 id="livraison">Livraison des achats</H2>
      <P>
        Quand un paiement est confirmé, Dev AppStore crée une <strong>livraison</strong> : un <C>PurchaseEvent</C> destiné à un joueur
        de votre jeu, identifié par un <C>delivery_id</C> unique. Elle est poussée à votre serveur (webhook) et/ou mise à disposition du
        SDK, jusqu’à ce que votre jeu l’acquitte.
      </P>

      <H3 id="webhook-ou-sdk">Webhook ou SDK ?</H3>
      <Table
        caption="Comparatif webhook et SDK"
        head={['', 'Webhook', 'SDK']}
        rows={[
          ['Pour qui', 'Jeux avec un serveur (en ligne, compte joueur côté serveur)', 'Jeux sans serveur, hors ligne, prototypes'],
          ['Où vit la clé API', 'Sur votre serveur uniquement', 'Embarquée dans le client (extractible)'],
          ['Arrivée de l’achat', 'Immédiate, même si le jeu est fermé', 'Au lancement, au retour au premier plan, en temps réel (JS)'],
          ['« Livré » quand…', 'votre serveur répond 2xx', 'le SDK a récupéré l’achat'],
          ['Relances', `Automatiques : ${RETRY_SCHEDULE_TEXT}`, 'L’achat reste proposé tant qu’il n’est pas acquitté'],
        ]}
      />
      <P>
        Les deux se combinent : avec une URL de webhook, le SDK continue de voir les livraisons non acquittées (utile pour afficher
        « Objet reçu » dans le client), mais c’est la réponse 2xx de votre serveur qui fait passer la livraison à <C>delivered</C>.
      </P>

      <H3 id="statuts">Statuts d’une livraison</H3>
      <Table
        caption="Statuts de livraison"
        head={['Statut', 'Signification']}
        rows={[
          [<C key="p">pending</C>, 'Créée, pas encore remise. Webhook : en attente d’une réponse 2xx (relances planifiées).'],
          [<C key="d">delivered</C>, 'Remise : votre webhook a répondu 2xx, ou le SDK l’a récupérée (jeu sans webhook).'],
          [<C key="a">acknowledged</C>, 'Votre jeu a confirmé le crédit (ack). État final : elle ne sera plus proposée.'],
          [<C key="f">failed</C>, 'Toutes les relances webhook ont échoué. Relançable depuis le journal de l’onglet Intégration ; un ack reste accepté.'],
        ]}
      />
      <CodeBlock lang="text" title="Cycle de vie" code={STATUS_DIAGRAM} />
      <P>
        L’ack est accepté depuis <C>pending</C>, <C>delivered</C> et <C>failed</C> : votre jeu peut avoir crédité via le SDK alors que le
        webhook échouait. Un second ack est sans effet et renvoie aussi <C>{'{ "ok": true }'}</C>.
      </P>

      <H3 id="idempotence">Idempotence</H3>
      <P>
        La livraison est garantie <strong>au moins une fois</strong>, pas exactement une fois : un webhook peut être relancé alors que
        votre serveur l’avait traité (délai dépassé, réponse perdue), et le SDK repropose tout achat non acquitté. Votre jeu doit donc
        être idempotent :
      </P>
      <UL>
        <li>
          enregistrez le <C>delivery_id</C> de chaque livraison créditée, dans la même transaction que le crédit ;
        </li>
        <li>
          si une livraison déjà connue revient, ne recréditez pas : répondez 2xx (webhook) ou ré-acquittez (SDK) ;
        </li>
        <li>
          <C>order_id</C> identifie la commande ; l’achat et son éventuel remboursement partagent le même <C>order_id</C> mais ont des{' '}
          <C>delivery_id</C> différents.
        </li>
      </UL>
      <P>
        Les SDK dédoublonnent déjà par <C>delivery_id</C> (et mémorisent les livraisons traitées si vous leur donnez un stockage) : si
        votre sauvegarde est côté serveur, gardez aussi cette clé d’idempotence chez vous.
      </P>

      <H3 id="remboursements">Remboursements</H3>
      <P>
        Lorsqu’une commande est remboursée, votre jeu reçoit un événement <C>purchase.refunded</C> par le même canal que l’achat
        (webhook ou SDK), avec un nouveau <C>delivery_id</C> et les mêmes <C>order_id</C>, <C>product_id</C> et <C>quantity</C>. Il se
        traite et s’acquitte comme un achat :
      </P>
      <CodeBlock lang="json" title="purchase.refunded" code={json(EXAMPLE_REFUND)} />
      <UL>
        <li>retirez l’objet ou la monnaie (sans descendre sous zéro si le joueur l’a déjà dépensée, selon votre politique) ;</li>
        <li>pour un non-consommable ou un abonnement, révoquez l’accès ;</li>
        <li>ignorez un remboursement dont l’achat d’origine n’a jamais été crédité, mais acquittez-le quand même.</li>
      </UL>
    </DocPage>
  );
}
