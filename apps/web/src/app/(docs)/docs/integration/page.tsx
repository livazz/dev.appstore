import { CodeBlock } from '@/components/docs/CodeBlock';
import { DownloadCard, FlowDiagram, GameScreens, InspectorMock, QuickSteps } from '@/components/docs/IntegrationVisuals';
import { A, C, Callout, DocPage, H2, H3, P, Step, Steps, UL } from '@/components/docs/prose';
import { DOCS_FACTS } from '@/lib/docs/facts';
import { SDK_PACKAGES } from '@/lib/docs/sdk-packages';
import { docPageMetadata } from '@/lib/seo';

export const metadata = docPageMetadata('integration');

const UNITY_GRANT = `using UnityEngine;

public class Inventory : MonoBehaviour
{
    // Branchée sur « On Item Granted » : reçoit l'identifiant produit et la quantité de l'article acheté.
    public void Grant(string productId, int quantity)
    {
        if (productId.StartsWith("gems_")) gems += quantity;
        else if (productId == "starter_pack") UnlockStarterPack();
        Save(); // sauvegardez avant de rendre la main
    }

    // Branchée sur « On Item Revoked » : un achat a été remboursé.
    public void Revoke(string productId, int quantity)
    {
        if (productId.StartsWith("gems_")) gems = Mathf.Max(0, gems - quantity);
        Save();
    }
}`;

const GODOT_GRANT = `extends Node

func _ready() -> void:
	DevAppStore.item_granted.connect(_on_item_granted)
	DevAppStore.item_revoked.connect(_on_item_revoked)

# Reçoit l'identifiant produit et la quantité de l'article acheté.
func _on_item_granted(product_id: String, quantity: int) -> void:
	if product_id.begins_with("gems_"):
		Save.gems += quantity
	Save.write()  # sauvegardez avant de rendre la main

# Un achat a été remboursé.
func _on_item_revoked(product_id: String, quantity: int) -> void:
	if product_id.begins_with("gems_"):
		Save.gems = max(0, Save.gems - quantity)
	Save.write()`;

export default function IntegrationPage() {
  return (
    <DocPage slug="integration">
      <H2 id="en-bref">En bref</H2>
      <P>
        Vous n’écrivez aucun code réseau. Vous posez un objet tout prêt dans votre jeu, vous y collez une clé, et vous lui indiquez
        quelle méthode de votre jeu donne un objet au joueur. Les achats faits sur le site arrivent ensuite tout seuls.
      </P>
      <QuickSteps />

      <H2 id="comment-ca-marche">Le parcours d’un achat</H2>
      <FlowDiagram />
      <P>
        L’achat est enregistré chez Dev AppStore dès le paiement, avec l’identifiant du joueur. Le jeu n’a pas besoin d’être ouvert à
        ce moment-là : l’objet attend. Quand le joueur lance le jeu ou y revient, l’objet posé dans votre scène interroge Dev AppStore,
        appelle votre méthode, puis confirme la réception. Tant que cette confirmation n’est pas partie, l’achat est reproposé.
      </P>
      <P>
        Pour savoir à qui livrer, le joueur relie une fois son jeu à son compte du site : le jeu affiche un code, il le saisit sur la
        boutique. C’est fourni aussi, vous n’avez pas d’écran à dessiner.
      </P>

      <H2 id="unity">Unity : le prefab</H2>
      <DownloadCard engine="Unity" version={SDK_PACKAGES.unity.version} href={SDK_PACKAGES.unity.href} hint={`${SDK_PACKAGES.unity.minEngine} ou plus récent · fichier .unitypackage`} />
      <Steps>
        <Step>
          <H3 id="unity-glisser">Glissez le paquet, puis le prefab</H3>
          <P>
            Glissez le fichier téléchargé dans la fenêtre <strong>Project</strong> de Unity et validez l’import. Ouvrez la première scène
            de votre jeu, puis glissez-y le prefab <C>Assets/DevAppStore/Prefabs/DevAppStore</C>. Il reste en place d’une scène à
            l’autre.
          </P>
        </Step>
        <Step>
          <H3 id="unity-cle">Collez votre clé publique</H3>
          <P>
            Dans l’espace studio, onglet <strong>Intégration</strong> de votre jeu, copiez la clé publique (<C>das_pub_…</C>). Collez-la
            dans le champ <strong>Publishable Key</strong> du prefab.
          </P>
        </Step>
        <Step>
          <H3 id="unity-brancher">Branchez votre inventaire</H3>
          <P>
            Sous <strong>On Item Granted</strong>, cliquez sur <strong>+</strong>, glissez l’objet de votre scène qui gère l’inventaire,
            puis choisissez votre méthode dans la liste « Dynamic Parameters ». Elle reçoit l’identifiant produit et la quantité de
            l’article, tels que vous les avez saisis dans l’éditeur de boutique.
          </P>
        </Step>
      </Steps>
      <InspectorMock />
      <P>La méthode à brancher ressemble à ceci. Si vous vendez déjà ces objets en jeu, vous l’avez probablement déjà :</P>
      <CodeBlock lang="csharp" title="Inventory.cs — votre code" code={UNITY_GRANT} />
      <Callout kind="tip" title="Essayé dans le moteur">
        <p>
          Ce parcours a été essayé de bout en bout dans Unity 6 : import du paquet, code de liaison, achat sur le site, objet reçu dans
          le jeu, confirmation de réception.
        </p>
      </Callout>
      <UL>
        <li>
          <strong>Votre jeu a des comptes ?</strong> Passez <strong>Player</strong> sur <C>Set By Game</C> et appelez{' '}
          <C>SetPlayer(id, nom)</C> à la connexion. Sinon, le prefab crée un identifiant et le garde sur l’appareil.
        </li>
        <li>
          <strong>Vous préférez votre propre bouton ?</strong> Décochez <strong>Show Button</strong> et reliez votre bouton à{' '}
          <C>OpenLinkPanel()</C>.
        </li>
        <li>
          <strong>Essai sur votre machine :</strong> pour une adresse en <C>http://</C>, autorisez-la dans{' '}
          <em>Project Settings → Player → Allow downloads over HTTP</em>.
        </li>
      </UL>

      <H2 id="godot">Godot : le plugin</H2>
      <DownloadCard engine="Godot" version={SDK_PACKAGES.godot.version} href={SDK_PACKAGES.godot.href} hint={`${SDK_PACKAGES.godot.minEngine} ou plus récent · archive .zip`} />
      <Steps>
        <Step>
          <H3 id="godot-glisser">Glissez le dossier, activez le plugin</H3>
          <P>
            Décompressez l’archive et glissez le dossier <C>addons</C> à la racine de votre projet. Dans{' '}
            <em>Projet → Paramètres du projet → Plugins</em>, activez <strong>DevAppStore</strong>.
          </P>
        </Step>
        <Step>
          <H3 id="godot-cle">Collez votre clé publique</H3>
          <P>
            Dans <em>Paramètres du projet</em> (avec « Paramètres avancés »), renseignez <C>devappstore/api/publishable_key</C> avec la
            clé publique du jeu et <C>devappstore/api/base_url</C> avec l’adresse de Dev AppStore.
          </P>
        </Step>
        <Step>
          <H3 id="godot-bouton">Glissez le bouton dans votre menu</H3>
          <P>
            Glissez la scène <C>res://addons/devappstore/link_button.tscn</C> dans votre menu : c’est le bouton « Boutique web », avec
            sa fenêtre de code.
          </P>
        </Step>
        <Step>
          <H3 id="godot-brancher">Branchez votre inventaire</H3>
          <P>
            Connectez le signal <C>item_granted</C> à votre inventaire. Dès qu’un script y est connecté, la confirmation de réception
            part toute seule après votre fonction.
          </P>
        </Step>
      </Steps>
      <CodeBlock lang="gdscript" title="inventory.gd — votre code" code={GODOT_GRANT} />
      <Callout kind="warn" title="Pas encore essayé dans Godot">
        <p>
          Contrairement au prefab Unity, cette partie glisser-déposer n’a pas encore été vérifiée dans l’éditeur Godot. Faites un
          essai complet avant de publier votre jeu.
        </p>
      </Callout>

      <H2 id="joueur">Ce que voit le joueur</H2>
      <GameScreens />
      <UL>
        <li>Dans le jeu, il appuie sur « Boutique web » : un code s’affiche, valable {DOCS_FACTS.linkCodeTtlMin} minutes.</li>
        <li>Sur la boutique de votre jeu, il se connecte, saisit ce code et confirme que c’est bien son compte de jeu.</li>
        <li>C’est fait une fois par appareil. Ensuite, chaque achat arrive dans le jeu, avec un petit message « Achat reçu ! ».</li>
      </UL>

      <H2 id="tester">Tester en deux minutes</H2>
      <Steps>
        <Step>
          <H3 id="tester-code">Lancez le jeu</H3>
          <P>Appuyez sur « Boutique web » et notez le code affiché.</P>
        </Step>
        <Step>
          <H3 id="tester-lier">Saisissez le code sur la boutique</H3>
          <P>Ouvrez la boutique de votre jeu sur le site, connectez-vous, saisissez le code et confirmez. Le jeu indique « Compte lié ! ».</P>
        </Step>
        <Step>
          <H3 id="tester-acheter">Achetez un article</H3>
          <P>
            Tant que les paiements réels ne sont pas activés sur votre installation, le paiement est simulé : rien n’est débité.
            Revenez dans le jeu, l’objet y est.
          </P>
        </Step>
      </Steps>

      <H2 id="questions">Questions fréquentes</H2>
      <H3 id="q-ferme">Le joueur achète alors que le jeu est fermé ?</H3>
      <P>L’achat attend chez Dev AppStore. Il est livré au prochain lancement, ou dès que le joueur revient dans le jeu.</P>
      <H3 id="q-double">Un objet peut-il être donné deux fois ?</H3>
      <P>
        Non. Chaque livraison porte un identifiant unique que le jeu mémorise : votre méthode n’est appelée qu’une fois par achat, même
        si la confirmation s’est perdue en route.
      </P>
      <H3 id="q-erreur">Et si ma méthode échoue ?</H3>
      <P>
        Si elle lève une exception, ou si rien n’est branché, l’achat n’est pas confirmé : il reste en attente et sera reproposé. Le
        joueur ne perd rien.
      </P>
      <H3 id="q-remboursement">Comment sont gérés les remboursements ?</H3>
      <P>
        Vous recevez l’identifiant produit et la quantité sur <C>On Item Revoked</C> (Unity) ou <C>item_revoked</C> (Godot) : retirez
        l’objet.
      </P>
      <H3 id="q-identifiants">Quels identifiants produit vais-je recevoir ?</H3>
      <P>
        Ceux que vous avez saisis pour chaque article dans l’éditeur de boutique. Si vous reprenez les identifiants de vos achats
        in-app existants, votre code de récompense actuel fonctionne tel quel.
      </P>
      <H3 id="q-cle">La clé collée dans le jeu est-elle secrète ?</H3>
      <P>
        Non : c’est la clé publique, prévue pour être embarquée. Elle ne donne accès aux achats d’un joueur qu’après la saisie de son
        code. Ne mettez jamais la clé secrète (<C>das_secret_…</C>) dans un jeu.
      </P>
      <H3 id="q-serveur">Mon jeu a un serveur ?</H3>
      <P>
        Recevez plutôt les achats sur votre serveur par <A href="/docs/webhooks">webhook signé</A> : la liaison est alors vérifiée par
        votre serveur. Pour Unreal et JavaScript, voyez la page <A href="/docs/sdk">SDK</A>.
      </P>
    </DocPage>
  );
}
