import { CodeBlock } from '@/components/docs/CodeBlock';
import { CodeTabs } from '@/components/docs/CodeTabs';
import { A, C, Callout, DocPage, H2, H3, P, Table, UL, docMetadata } from '@/components/docs/prose';

export const metadata = docMetadata('sdk');

/* Contenu repris des README de packages/sdk-js et sdks/{unity,godot,unreal}. */

const JS_EXAMPLE = `import { DevAppStore } from '@devappstore/sdk';

const client = new DevAppStore({ apiKey: 'das_live_…', baseUrl: 'https://…', storage: localStorage });

// 1. Liaison (une fois) : afficher un code que le joueur saisit sur Dev AppStore.
const { code, expires_at } = await client.requestLinkCode(player.id, player.name);

// 2. Livraison : le handler reçoit chaque achat une seule fois ; l'ack part quand il a résolu.
const sub = client.onPurchase(player.id, async (e) => {
  if (e.event === 'purchase.completed') await inventory.add(e.product_id, e.quantity);
  if (e.event === 'purchase.refunded') await inventory.remove(e.product_id, e.quantity);
});

// À la déconnexion du joueur :
sub.unsubscribe();`;

const JS_SERVER = `import { verifyWebhookSignature, constructWebhookEvent } from '@devappstore/sdk/server';

// Corps BRUT (avant JSON.parse) + en-tête DevAppStore-Signature + secret webhook du jeu.
if (!verifyWebhookSignature(rawBody, req.headers['devappstore-signature'], process.env.WEBHOOK_SECRET)) {
  return res.writeHead(401).end();
}
const event = constructWebhookEvent(rawBody, req.headers['devappstore-signature'], process.env.WEBHOOK_SECRET);
// Créditer de façon idempotente (clé : event.delivery_id), puis répondre 2xx.`;

const UNITY_EXAMPLE = `using UnityEngine;
using DevAppStore;

public class Shop : MonoBehaviour
{
    DevAppStoreClient client;

    void Start()
    {
        // 1. Client (ou ajoutez le composant DevAppStoreClient dans une scène et renseignez l'inspecteur).
        client = DevAppStoreClient.Create("das_live_…", "https://…", pollIntervalSeconds: 30);

        // 2. Créditer l'achat. Lever une exception = pas d'ack, l'achat sera reproposé.
        client.OnPurchase += e =>
        {
            if (e.IsRefund) Inventory.Remove(e.product_id, e.quantity);
            else Inventory.Add(e.product_id, e.quantity);
            SaveGame(); // persistez AVANT de rendre la main : l'ack part juste après
        };
        client.OnError += err => Debug.LogWarning(err);

        // 3. Le joueur est connecté : rattrapage immédiat, puis toutes les 30 s et au retour au premier plan.
        client.SetPlayer(PlayerAccount.Id);
    }

    // 4. Paramètres → « Lier un compte web » : afficher le code de liaison.
    public void OnLinkButton()
    {
        client.RequestLinkCode(PlayerAccount.Name,
            code => linkLabel.text = $"Code de liaison : {code.code}",
            err => linkLabel.text = "Réessayez plus tard");
    }
}`;

const GODOT_EXAMPLE = `extends Node

func _ready() -> void:
	DevAppStore.purchase_received.connect(_on_purchase)
	DevAppStore.refund_received.connect(_on_refund)
	DevAppStore.request_failed.connect(func(endpoint, status, code, msg):
		push_warning("%s : %d %s %s" % [endpoint, status, code, msg]))
	# Après la connexion du joueur dans VOTRE jeu :
	DevAppStore.set_player_id(Save.player_id)  # déclenche un polling immédiat


func _on_purchase(p: Dictionary) -> void:
	# Idempotence : ne jamais créditer deux fois la même livraison.
	if Save.delivered_ids.has(p.delivery_id):
		DevAppStore.ack(p.delivery_id)
		return
	match p.product_id:
		"gems_500":
			Save.gems += 500 * p.quantity
		"no_ads":
			Save.no_ads = true
		_:
			return  # produit inconnu : pas d'ack, l'achat sera re-proposé après mise à jour du jeu
	Save.delivered_ids.append(p.delivery_id)
	Save.write()                  # 1. crédit persisté
	DevAppStore.ack(p.delivery_id)    # 2. puis seulement l'accusé de réception


func _on_refund(p: Dictionary) -> void:
	if p.product_id == "gems_500":
		Save.gems = max(0, Save.gems - 500 * p.quantity)
		Save.write()
	DevAppStore.ack(p.delivery_id)`;

const GODOT_LINK = `func _on_link_button_pressed() -> void:
	var r := await DevAppStore.request_link_code(Save.player_name)
	if r.is_empty():
		$CodeLabel.text = "Impossible d'obtenir un code, réessayez."
		return
	$CodeLabel.text = "Code de liaison : %s" % r.code`;

const UNREAL_INI = `[/Script/DevAppStore.DevAppStoreSettings]
BaseUrl=http://localhost:3000
ApiKey=das_dev_xxx
PollIntervalSeconds=60
bPollOnFocus=True`;

const UNREAL_EXAMPLE = `// MonGameInstance.cpp
#include "DevAppStoreSubsystem.h"

void UMonGameInstance::Init()
{
	Super::Init();
	UDevAppStoreSubsystem* Sdk = GetSubsystem<UDevAppStoreSubsystem>();
	Sdk->OnPurchase.AddDynamic(this, &UMonGameInstance::HandlePurchase);
	Sdk->OnRefund.AddDynamic(this, &UMonGameInstance::HandleRefund);
	// Après la connexion du joueur dans VOTRE jeu :
	Sdk->SetPlayerId(MaSauvegarde->PlayerId); // déclenche un polling immédiat
}

void UMonGameInstance::HandlePurchase(const FDevAppStorePurchase& Purchase)
{
	UDevAppStoreSubsystem* Sdk = GetSubsystem<UDevAppStoreSubsystem>();
	if (MaSauvegarde->DeliveredIds.Contains(Purchase.DeliveryId)) // idempotence
	{
		Sdk->Ack(Purchase.DeliveryId);
		return;
	}
	if (Purchase.ProductId == TEXT("gems_500"))
	{
		MaSauvegarde->Gems += 500 * Purchase.Quantity;
	}
	else
	{
		return; // produit inconnu : pas d'ack, l'achat sera re-proposé
	}
	MaSauvegarde->DeliveredIds.Add(Purchase.DeliveryId);
	UGameplayStatics::SaveGameToSlot(MaSauvegarde, TEXT("Main"), 0); // 1. crédit persisté
	Sdk->Ack(Purchase.DeliveryId);                                   // 2. puis seulement l'ack
}`;

export default function SdkPage() {
  return (
    <DocPage slug="sdk">
      <H2 id="choisir">Quel SDK ?</H2>
      <P>
        Tous les SDK parlent à la même <A href="/docs/api">API v1</A> et suivent les mêmes règles : chaque achat est remis{' '}
        <strong>une seule fois par <C>delivery_id</C></strong>, vous créditez et sauvegardez, puis l’ack part. Les identifiants techniques
        (paquet <C>@devappstore/sdk</C>, classes <C>Dev AppStore…</C>) conservent leur nom historique.
      </P>
      <Table
        caption="SDK disponibles"
        head={['SDK', 'Moteur / plateforme', 'Réception', 'Version min.']}
        rows={[
          [<A key="a" href="#sdk-js">JavaScript / TypeScript</A>, 'Navigateur (HTML5, WebGL, WebView), Node', 'Temps réel (SSE) + rattrapage', 'Node 20'],
          [<A key="a" href="#sdk-unity">Unity</A>, 'Toutes plateformes (UnityWebRequest)', 'Interrogation + premier plan', 'Unity 2021.3'],
          [<A key="a" href="#sdk-godot">Godot</A>, 'GDScript, toutes plateformes', 'Interrogation + premier plan', 'Godot 4.2'],
          [<A key="a" href="#sdk-unreal">Unreal Engine</A>, 'C++ et Blueprints', 'Interrogation + premier plan', 'UE 5.1'],
        ]}
      />
      <Callout kind="warn" title="Clé embarquée = clé extractible">
        <p>
          Un SDK client embarque la clé API du jeu. Pour un jeu en ligne ou des objets de valeur, recevez les achats par{' '}
          <A href="/docs/webhooks">webhook</A> sur votre serveur et gardez la clé côté serveur. Voir{' '}
          <A href="/docs/bonnes-pratiques#cle-secrete">Bonnes pratiques</A>.
        </p>
      </Callout>

      {/* ---------------------------------------------------------------- JS */}
      <H2 id="sdk-js">JavaScript / TypeScript</H2>
      <P>
        Paquet <C>@devappstore/sdk</C>, sans dépendance, pour le navigateur et Node ≥ 20. Il fournit aussi la vérification de webhook côté
        serveur (<C>@devappstore/sdk/server</C>).
      </P>
      <CodeBlock lang="ts" title="client.ts" code={JS_EXAMPLE} />
      <Table
        caption="Méthodes du SDK JavaScript"
        head={['Méthode', 'Appel HTTP', 'Résultat']}
        rows={[
          [<C key="a">requestLinkCode(playerId, playerName?)</C>, <C key="b">POST /api/v1/link-codes</C>, <C key="c">{'{ code, expires_at }'}</C>],
          [<C key="a">getPendingPurchases(playerId)</C>, <C key="b">GET /api/v1/deliveries</C>, <C key="c">PurchaseEvent[]</C>],
          [<C key="a">onPurchase(playerId, handler)</C>, <C key="b">GET /api/v1/deliveries/stream</C>, <><C>PurchaseSubscription</C> (<C>unsubscribe()</C>, <C>catchUp()</C>, <C>connected</C>)</>],
          [<C key="a">ack(deliveryId)</C>, <C key="b">POST /api/v1/deliveries/{'{id}'}/ack</C>, <C key="c">{'{ ok: true }'}</C>],
        ]}
      />
      <H3 id="sdk-js-garanties">Garanties de onPurchase</H3>
      <UL>
        <li>
          <strong>Temps réel</strong> : flux SSE lu via <C>fetch</C> + <C>ReadableStream</C> (permet l’en-tête Authorization).
        </li>
        <li>
          <strong>Rattrapage</strong> au démarrage, à chaque reconnexion, au retour de l’onglet au premier plan et au retour du réseau.
        </li>
        <li>
          <strong>Reconnexion exponentielle</strong> : 1 s, 2 s, 4 s… jusqu’à 30 s (avec gigue) ; reconnexion si rien n’arrive pendant
          45 s. Une clé refusée (401/403) arrête les tentatives et appelle <C>onError</C>.
        </li>
        <li>
          <strong>Jamais de double crédit</strong> : dédoublonnage par <C>delivery_id</C>, handlers exécutés en série. Passez{' '}
          <C>storage: localStorage</C> pour retenir les livraisons traitées entre deux lancements.
        </li>
        <li>
          <strong>Ack après crédit</strong> : si le handler lève une erreur, rien n’est acquitté. <C>autoAck: false</C> pour acquitter
          vous-même.
        </li>
      </UL>
      <P>
        Options : <C>apiKey</C> (obligatoire), <C>baseUrl</C>, <C>fetch</C>, <C>transport</C> (<C>auto</C> | <C>fetch</C> |{' '}
        <C>eventsource</C>), <C>EventSource</C>, <C>storage</C>, <C>autoAck</C> (true), <C>reconnectDelayMs</C> (1000),{' '}
        <C>maxReconnectDelayMs</C> (30000), <C>idleTimeoutMs</C> (45000), <C>timeoutMs</C> (15000), <C>onError</C>. Les erreurs de l’API
        sont levées en <C>DevAppStoreError</C> (<C>status</C>, <C>code</C>, <C>message</C>).
      </P>
      <CodeBlock lang="ts" title="Côté serveur : vérifier un webhook" code={JS_SERVER} />

      {/* ---------------------------------------------------------------- Unity */}
      <H2 id="sdk-unity">Unity (C#)</H2>
      <P>
        Paquet UPM <C>com.devappstore.sdk</C>, Unity 2021.3+, aucune dépendance (UnityWebRequest + JsonUtility). Installation :{' '}
        <em>Window → Package Manager → + → Add package from git URL…</em> avec le chemin <C>?path=/sdks/unity</C> du dépôt, ou{' '}
        <em>Add package from disk…</em> et <C>sdks/unity/package.json</C>.
      </P>
      <CodeBlock lang="csharp" title="Shop.cs" code={UNITY_EXAMPLE} />
      <Table
        caption="Comportement du SDK Unity"
        head={['Quand', 'Quoi']}
        rows={[
          [<><C>SetPlayer</C>, lancement (<C>OnEnable</C>)</>, <C key="b">GET /api/v1/deliveries?player_id=…</C>],
          [<>Toutes les <C>pollIntervalSeconds</C> (≥ 5 s)</>, 'idem'],
          [<><C>OnApplicationFocus(true)</C> / <C>OnApplicationPause(false)</C></>, 'idem (le joueur revient de la boutique web)'],
          [<C key="a">CheckNow()</C>, 'idem, à la demande'],
          [<>Après <C>OnPurchase</C> sans exception</>, <><C>POST /api/v1/deliveries/{'{id}'}/ack</C> (<C>autoAck</C>)</>],
          [<C key="a">RequestLinkCode(name, ok, err)</C>, <><C>POST /api/v1/link-codes</C> → <C>LinkCode</C></>],
        ]}
      />
      <P>
        Les 200 derniers <C>delivery_id</C> traités sont mémorisés dans <C>PlayerPrefs</C> avant l’ack : un ack perdu entraîne un simple
        ré-acquittement. Erreurs : <C>DevAppStoreError {'{ Status, Code, Message }'}</C> (<C>Status = 0</C> pour le réseau).
      </P>

      {/* ---------------------------------------------------------------- Godot */}
      <H2 id="sdk-godot">Godot 4</H2>
      <P>
        GDScript pur, Godot 4.2+. Copiez <C>addons/devappstore/</C> dans le dossier <C>addons/</C> de votre projet et activez le plugin
        (<em>Projet → Paramètres du projet → Plugins</em>) : il enregistre l’autoload <C>Dev AppStore</C> et ces réglages :
      </P>
      <Table
        caption="Réglages du SDK Godot"
        head={['Réglage', 'Défaut', 'Rôle']}
        rows={[
          [<C key="a">devappstore/api/base_url</C>, '—', 'URL de Dev AppStore (en dev : http://localhost:3000)'],
          [<C key="a">devappstore/api/api_key</C>, '—', 'Clé API du jeu (das_…, onglet Intégration)'],
          [<C key="a">devappstore/delivery/poll_interval_sec</C>, '60', 'Intervalle de polling (0 = désactivé)'],
          [<C key="a">devappstore/delivery/poll_on_focus</C>, 'true', 'Interroger au retour au premier plan'],
        ]}
      />
      <CodeTabs
        ariaLabel="Exemples Godot"
        tabs={[
          { label: 'Achats', title: 'shop.gd', code: GODOT_EXAMPLE },
          { label: 'Liaison', title: 'link_button.gd', code: GODOT_LINK },
        ]}
      />
      <P>
        Signaux : <C>purchase_received</C>, <C>refund_received</C>, <C>ack_completed</C>, <C>link_code_received</C>,{' '}
        <C>request_failed</C>. Méthodes : <C>set_player_id</C>, <C>poll</C>, <C>ack</C>, <C>request_link_code</C>, <C>configure</C>.
        L’accusé de réception est persisté dans <C>user://devappstore_sdk.cfg</C> et renvoyé au polling suivant s’il a échoué.
      </P>

      {/* ---------------------------------------------------------------- Unreal */}
      <H2 id="sdk-unreal">Unreal Engine 5</H2>
      <P>
        Plugin C++ runtime, UE 5.1+, modules moteur uniquement. Copiez <C>Dev AppStore/</C> dans <C>Plugins/</C>, régénérez les fichiers projet
        et compilez, puis réglez <em>Paramètres du projet → Plugins → Dev AppStore</em> (enregistré dans <C>Config/DefaultGame.ini</C>).
        Ajoutez <C>&quot;Dev AppStore&quot;</C> à <C>PublicDependencyModuleNames</C> pour l’utiliser depuis votre module.
      </P>
      <CodeTabs
        ariaLabel="Exemples Unreal"
        tabs={[
          { label: 'C++', title: 'MonGameInstance.cpp', code: UNREAL_EXAMPLE },
          { label: 'Configuration', title: 'Config/DefaultGame.ini', code: UNREAL_INI },
        ]}
      />
      <UL>
        <li>
          <C>UDevAppStoreSubsystem</C> (<C>UGameInstanceSubsystem</C>) interroge l’API dès <C>SetPlayerId</C>, toutes les{' '}
          <C>PollIntervalSeconds</C> et au retour au premier plan.
        </li>
        <li>
          Délégués : <C>OnPurchase</C>, <C>OnRefund</C>, <C>OnAckCompleted</C>, <C>OnLinkCode</C>, <C>OnRequestFailed</C>.
        </li>
        <li>
          Blueprints : <em>Get Dev AppStore Subsystem</em> → <em>Bind Event to On Purchase</em> → créditez, <em>Save Game to Slot</em>, puis{' '}
          <em>Ack</em> avec le <C>DeliveryId</C>.
        </li>
        <li>
          L’ack est persisté dans le slot <C>DevAppStoreSDK</C> et renvoyé au polling suivant en cas d’échec réseau, sans rediffuser{' '}
          <C>OnPurchase</C>.
        </li>
      </UL>
    </DocPage>
  );
}
