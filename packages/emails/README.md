# @devappstore/emails

E-mails transactionnels Dev AppStore, sans dépendance lourde : chaque modèle est une fonction TS qui renvoie
`{ subject, html, text }` (HTML compatible clients mail : tableaux, styles inline, 600 px, logo D jaune en
pur HTML). **Code serveur uniquement** (l'adaptateur console utilise `node:fs`).

## Modèles

| Fonction | Destinataire | Quand |
|---|---|---|
| `purchaseReceiptEmail` | joueur | commande payée — reçu **et** confirmation sur support durable de la demande de livraison immédiate et de la renonciation au droit de rétractation (art. L221-28 13°, L221-13 C. conso ; `docs/legal/consumer.md` §2.3) |
| `purchaseDeliveredEmail` | joueur | livraison `delivered` / `acknowledged` |
| `deliveryFailedEmail` | joueur | livraison `failed` (relances épuisées) |
| `withdrawalAcknowledgementEmail` | joueur | rétractation enregistrée — accusé de réception sur support durable (directive 2023/2673, art. L221-21) : commande, article, montant remboursé, date de la demande, délai de remboursement (≤ 14 jours). Marque « Dev AppStore » (`DEV_APPSTORE_BRAND`, logo carré jaune « D ») |
| `playerWelcomeEmail` | joueur | inscription |
| `verifyEmailEmail`, `passwordResetEmail` | tous | Better Auth (`sendVerificationEmail`, `sendResetPassword`) |
| `studioWelcomeEmail` | studio | création du studio |
| `studioDeliveryAlertEmail` | studio | livraisons en échec |
| `studioWeeklyReportEmail` | studio | cron hebdo (revenu, économie vs stores via `savingsVsStores`) |

`renderEmail({ …, brand })` accepte une marque d'en-tête (`DEVAPPSTORE_BRAND` par défaut, `DEV_APPSTORE_BRAND`).

`WITHDRAWAL_WAIVER_TEXT` est le texte exact de la case à cocher du checkout : l'afficher tel quel, ou passer
la variante réellement affichée dans `consent.waiverText`.

## Envoi

```ts
import { createMailerFromEnv, sendEmail, purchaseReceiptEmail, contextFromEnv } from '@devappstore/emails';

const mailer = createMailerFromEnv(); // console en dev, Resend si RESEND_API_KEY
await sendEmail(mailer, user.email, purchaseReceiptEmail(data, contextFromEnv()));
```

| Variable | Rôle |
|---|---|
| `MAIL_TRANSPORT` | `console` ou `resend` (défaut : `resend` si `RESEND_API_KEY`, sinon `console`) |
| `RESEND_API_KEY` | clé Resend |
| `MAIL_FROM` | expéditeur (défaut `Dev AppStore <no-reply@devappstore.com>`, domaine à vérifier chez Resend) |
| `MAIL_REPLY_TO` | adresse de réponse |
| `MAIL_CONSOLE_DIR` | dossier des copies HTML en dev (défaut `.data/mails`, relatif au cwd) |
| `APP_URL` / `NEXT_PUBLIC_APP_URL`, `SUPPORT_EMAIL`, `MAIL_COMPANY_NAME`, `MAIL_COMPANY_ADDRESS`, `MAIL_MEDIATOR_NAME`, `MAIL_MEDIATOR_URL` | lus par `contextFromEnv()` |

## Sécurité

- Toute donnée dynamique passe par le gabarit `html\`…\`` qui échappe chaque interpolation.
- Les liens passent par `safeUrl` (`https:`/`http:` seulement, sinon exception).
- Objet nettoyé (pas de CR/LF), destinataire validé (pas d'injection d'en-tête ni de liste).

## Prévisualisation

```sh
npm run preview -w @devappstore/emails   # → .data/mails-preview/index.html
```
