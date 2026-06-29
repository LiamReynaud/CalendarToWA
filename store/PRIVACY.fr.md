# Politique de confidentialité — Calendar to WhatsApp

*Dernière mise à jour : juin 2026*

## Responsable

Extension **Calendar to WhatsApp**, développée par Liam Reynaud / BAVASAK.  
Contact : via le dépôt GitHub [LiamReynaud/CalendarToWA](https://github.com/LiamReynaud/CalendarToWA).

## Résumé

Cette extension Chrome aide l’utilisateur à repérer des numéros de téléphone dans Google Calendar et à créer ou ouvrir le contact correspondant sur WhatsApp Web. **Aucune donnée n’est collectée sur un serveur externe** : le traitement se fait entièrement dans le navigateur de l’utilisateur.

## Données concernées

Lorsque vous utilisez l’extension, les informations suivantes peuvent être lues **localement** dans votre navigateur :

- Contenu visible d’un événement Google Calendar (titre, description, lieu, noms des participants) pour détecter des numéros de téléphone et la date/heure du rendez-vous ;
- Numéro de téléphone, prénom et suffixe que vous choisissez avant d’envoyer vers WhatsApp ;
- Préférences de l’extension : indicatif pays par défaut, liste de suffixes (ex. nom d’équipe).

Sur WhatsApp Web, l’extension interagit avec l’interface pour rechercher un numéro, ouvrir une discussion ou remplir un formulaire de contact **uniquement après votre action explicite**.

## Stockage

Les préférences et le contact en cours de traitement sont stockés via **chrome.storage** (local à votre profil Chrome). Ils ne sont pas synchronisés vers nos serveurs.

## Partage des données

Nous **ne vendons**, **ne louons** et **ne transmettons** vos données à des tiers.  
L’extension ne communique qu’avec :

- **Google Calendar** et **WhatsApp Web**, sites que vous ouvrez vous-même dans Chrome ;
- l’**API Chrome Web Store**, uniquement pour les mises à jour de l’extension (via le mécanisme standard du navigateur).

## Google Calendar — Limited Use

L’utilisation par l’extension des informations reçues via Google Calendar respecte la [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), y compris les exigences **Limited Use** : les données du calendrier servent uniquement à la fonctionnalité affichée à l’utilisateur (détection de numéro et date de RDV), ne sont pas transférées à d’autres personnes, et ne sont pas utilisées à des fins publicitaires.

## Permissions Chrome

| Permission | Usage |
|------------|--------|
| `storage` | Sauvegarder indicatif pays et suffixes |
| `clipboardWrite` | Copie sur demande explicite |
| `tabs` | Ouvrir ou réutiliser l’onglet WhatsApp Web |
| `scripting` | Injecter les scripts sur Calendar et WhatsApp après action utilisateur |
| `calendar.google.com` | Lire l’événement ouvert pour détecter numéros et date |
| `web.whatsapp.com` | Automatiser la recherche et la création de contact |

## Conservation

Les données temporaires liées à un contact en cours (ex. numéro en attente d’ouverture WhatsApp) expirent automatiquement après quelques minutes ou lorsque vous fermez l’overlay.

## Vos droits

Vous pouvez à tout moment :

- désinstaller l’extension ;
- effacer les données de l’extension via Chrome → Paramètres → Extensions → Calendar to WhatsApp → Détails → Effacer les données de stockage.

## Modifications

Cette politique peut être mise à jour. La version en vigueur est celle publiée dans le dépôt GitHub de l’extension.

## English summary

Calendar to WhatsApp runs entirely in your browser. It reads Google Calendar event content and automates WhatsApp Web only when you trigger contact creation. No personal data is sent to our servers. Preferences are stored locally via chrome.storage.
