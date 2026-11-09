/**
 * Plan de la documentation développeur (/docs) : navigation latérale, sommaire de page et index de recherche.
 * Chaque `sections[].id` doit correspondre à l'attribut `id` d'un titre de la page (vérifié par nav.test.ts).
 */

export interface DocSection {
  id: string;
  title: string;
  /** Mots supplémentaires pour la recherche (synonymes, termes techniques). */
  keywords?: string;
}

export type DocGroup = 'Prise en main' | 'Guides' | 'Référence';

export interface DocPage {
  /** Segment d'URL sous /docs ('' = accueil). */
  slug: string;
  title: string;
  description: string;
  group: DocGroup;
  keywords?: string;
  sections: DocSection[];
}

export const DOC_GROUPS: DocGroup[] = ['Prise en main', 'Guides', 'Référence'];

export const DOC_PAGES: DocPage[] = [
  {
    slug: '',
    title: 'Introduction',
    description: 'Vendre vos objets in-app sur le web et les livrer automatiquement dans le jeu.',
    group: 'Prise en main',
    keywords: 'accueil présentation overview',
    sections: [
      { id: 'principe', title: 'Le principe' },
      { id: 'parcours', title: 'Parcours du joueur', keywords: 'liaison achat livraison' },
      { id: 'sommaire', title: 'Par où commencer' },
    ],
  },
  {
    slug: 'demarrage-rapide',
    title: 'Démarrage rapide',
    description: 'Du compte studio au premier achat livré dans votre jeu, en quelques minutes.',
    group: 'Prise en main',
    keywords: 'quickstart tutoriel débuter commencer',
    sections: [
      { id: 'compte-studio', title: '1. Créer un compte studio', keywords: 'inscription signup' },
      { id: 'creer-le-jeu', title: '2. Créer le jeu', keywords: 'clé api secret webhook' },
      { id: 'editeur-boutique', title: '3. Composer la boutique', keywords: 'articles produit product_id prix éditeur' },
      { id: 'integration', title: '4. Intégrer en 3 étapes', keywords: 'intégration' },
      { id: 'etape-liaison', title: 'Étape 1 : lier le compte du joueur', keywords: 'code link' },
      { id: 'etape-reception', title: 'Étape 2 : recevoir les achats', keywords: 'webhook sdk' },
      { id: 'etape-ack', title: 'Étape 3 : créditer puis acquitter', keywords: 'ack accusé' },
      { id: 'tester', title: 'Tester de bout en bout', keywords: 'simulation démo test mock' },
    ],
  },
  {
    slug: 'concepts',
    title: 'Concepts',
    description: 'Liaison de compte, cycle de vie d’une livraison, idempotence et remboursements.',
    group: 'Guides',
    sections: [
      { id: 'liaison', title: 'Liaison de compte', keywords: 'link linking compte joueur' },
      { id: 'methode-code', title: 'Méthode « code »', keywords: 'link code vérifié' },
      { id: 'methode-id-confirm', title: 'Méthode « id_confirm »', keywords: 'identifiant player lookup déclaratif' },
      { id: 'methode-oauth', title: 'Méthode « oauth » (à venir)', keywords: 'oauth connexion' },
      { id: 'livraison', title: 'Livraison des achats', keywords: 'delivery' },
      { id: 'webhook-ou-sdk', title: 'Webhook ou SDK ?', keywords: 'choix serveur client' },
      { id: 'statuts', title: 'Statuts d’une livraison', keywords: 'pending delivered acknowledged failed' },
      { id: 'idempotence', title: 'Idempotence', keywords: 'double crédit delivery_id doublon' },
      { id: 'remboursements', title: 'Remboursements', keywords: 'refund purchase.refunded' },
    ],
  },
  {
    slug: 'webhooks',
    title: 'Webhooks',
    description: 'Recevoir les achats sur votre serveur et vérifier la signature HMAC-SHA256.',
    group: 'Guides',
    keywords: 'serveur signature hmac',
    sections: [
      { id: 'fonctionnement', title: 'Fonctionnement' },
      { id: 'requete', title: 'Requête envoyée', keywords: 'en-têtes headers Wolleen-Delivery' },
      { id: 'purchase-event', title: 'Format PurchaseEvent', keywords: 'payload corps json' },
      { id: 'signature', title: 'Signature', keywords: 'Wolleen-Signature hmac sha256 tolérance' },
      { id: 'verification', title: 'Vérifier la signature', keywords: 'node python php go csharp c#' },
      { id: 'relances', title: 'Réponses et relances', keywords: 'retry 2xx timeout échec' },
    ],
  },
  {
    slug: 'sdk',
    title: 'SDK',
    description: 'Recevoir les achats directement dans le client : JavaScript, Unity, Godot et Unreal.',
    group: 'Guides',
    keywords: 'client librairie bibliothèque',
    sections: [
      { id: 'choisir', title: 'Quel SDK ?' },
      { id: 'sdk-js', title: 'JavaScript / TypeScript', keywords: 'web html5 webgl node sse onPurchase' },
      { id: 'sdk-unity', title: 'Unity (C#)', keywords: 'upm csharp OnPurchase' },
      { id: 'sdk-godot', title: 'Godot 4', keywords: 'gdscript addon autoload' },
      { id: 'sdk-unreal', title: 'Unreal Engine 5', keywords: 'c++ blueprints subsystem' },
    ],
  },
  {
    slug: 'player-lookup',
    title: 'Endpoint player lookup',
    description: 'L’endpoint à exposer pour la liaison par identifiant joueur (id_confirm).',
    group: 'Guides',
    keywords: 'id_confirm recherche joueur',
    sections: [
      { id: 'role', title: 'Rôle' },
      { id: 'appel', title: 'Appel reçu', keywords: 'requête GET {player_id}' },
      { id: 'signature-lookup', title: 'Signature', keywords: 'hmac Wolleen-Signature' },
      { id: 'reponse', title: 'Réponse PlayerLookupResponse', keywords: 'display_name level avatar_url' },
      { id: 'exemple-lookup', title: 'Exemple d’implémentation' },
      { id: 'contraintes', title: 'Contraintes et sécurité', keywords: 'timeout ssrf limite' },
    ],
  },
  {
    slug: 'bonnes-pratiques',
    title: 'Bonnes pratiques',
    description: 'Sécurité des clés, crédit fiable, et conformité aux règles des stores mobiles.',
    group: 'Guides',
    keywords: 'sécurité conformité checklist',
    sections: [
      { id: 'cle-secrete', title: 'Clé secrète côté serveur', keywords: 'api key sécurité' },
      { id: 'ack-apres-sauvegarde', title: 'Acquitter après la sauvegarde', keywords: 'ack crédit' },
      { id: 'idempotence-pratique', title: 'Ne jamais créditer deux fois', keywords: 'delivery_id doublon' },
      { id: 'libelles-neutres', title: 'Libellés neutres', keywords: 'apple google stores app store play steering' },
      { id: 'checklist', title: 'Check-list de mise en production', keywords: 'production lancement' },
    ],
  },
  {
    slug: 'api',
    title: 'Référence API v1',
    description: 'Toutes les routes de l’API publique : authentification, paramètres, réponses et erreurs.',
    group: 'Référence',
    keywords: 'rest http curl endpoints',
    sections: [
      { id: 'authentification', title: 'Authentification', keywords: 'bearer authorization clé wk_' },
      { id: 'erreurs', title: 'Erreurs', keywords: 'error code message 401 400 404 429' },
      { id: 'post-link-codes', title: 'POST /api/v1/link-codes', keywords: 'code de liaison' },
      { id: 'get-deliveries', title: 'GET /api/v1/deliveries', keywords: 'livraisons en attente polling' },
      { id: 'get-deliveries-stream', title: 'GET /api/v1/deliveries/stream', keywords: 'sse temps réel event-stream' },
      { id: 'post-ack', title: 'POST /api/v1/deliveries/{id}/ack', keywords: 'acquitter acknowledge' },
      { id: 'cors', title: 'CORS', keywords: 'navigateur' },
    ],
  },
];

export function docHref(slug: string, sectionId?: string) {
  const base = slug ? `/docs/${slug}` : '/docs';
  return sectionId ? `${base}#${sectionId}` : base;
}

export function getDocPage(slug: string): DocPage {
  const page = DOC_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Page de documentation inconnue : ${slug}`);
  return page;
}

/** Page précédente / suivante dans l'ordre de lecture (groupes puis ordre de déclaration). */
export function docNeighbours(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const ordered = DOC_GROUPS.flatMap((g) => DOC_PAGES.filter((p) => p.group === g));
  const i = ordered.findIndex((p) => p.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}
