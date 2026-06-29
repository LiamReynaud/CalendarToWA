# Fiche Chrome Web Store — Calendar to WhatsApp (français)

Archive : `store/release/1.9.9/CalendarToWA-chrome-store-1.9.9.zip`  
Politique de confidentialité : `POLITIQUE_CONFIDENTIALITE.fr.md` (à héberger en URL publique)

---

## Identité

| Champ | Valeur |
|-------|--------|
| **Nom** (45 car. max) | Calendar to WhatsApp |
| **Langue principale** | Français |
| **Catégorie** | Productivité |
| **Visibilité recommandée** | Non répertorié (usage équipe interne) — ou Public |

---

## Résumé (132 caractères max)

```
Détecte les numéros dans Google Calendar et ouvre WhatsApp Web pour créer ou retrouver le contact du rendez-vous.
```

*(118 caractères)*

---

## Description détaillée

```
Calendar to WhatsApp relie vos rendez-vous Google Calendar à WhatsApp Web pour gagner du temps lors de la prise de contact.

À QUOI SERT CETTE EXTENSION ?

• Détecter automatiquement les numéros de téléphone dans un événement Google Calendar (titre, description, lieu, invités…)
• Proposer la création ou l’ouverture du contact correspondant sur WhatsApp Web
• Pré-remplir le prénom, le nom (suffixe équipe) et afficher la date/heure du RDV pendant l’automatisation

COMMENT ÇA MARCHE ?

1. Ouvrez un événement dans Google Calendar contenant un numéro de mobile.
2. Une bannière « Calendar to WhatsApp » apparaît avec le numéro détecté.
3. Choisissez le prénom et le suffixe (ex. Alegria), puis cliquez « Créer le contact ».
4. WhatsApp Web s’ouvre : l’extension recherche le numéro, ouvre la discussion ou le formulaire « Nouveau contact », puis remplit les champs.
5. Vérifiez et enregistrez le contact dans WhatsApp si nécessaire.

PRÉREQUIS

• Google Calendar ouvert dans Chrome
• WhatsApp Web connecté sur le même navigateur
• Pour les nouveaux contacts : fonction « Ajouter un contact » disponible sur votre compte WhatsApp Web

SÉCURITÉ ET DONNÉES

• L’extension lit uniquement le contenu des pages Google Calendar et WhatsApp Web que vous consultez.
• La configuration (indicatif pays, suffixes) est stockée localement dans Chrome (chrome.storage), sur votre appareil.
• Aucune donnée n’est envoyée à un serveur tiers : tout s’exécute dans votre navigateur.

LIMITES

• WhatsApp Web ne propose pas d’URL officielle de création de contact : l’extension automatise l’interface, qui peut varier selon les versions.
• En cas d’échec, un overlay propose de réessayer ou d’ouvrir la conversation manuellement.

SUPPORT

Rechargez l’extension et WhatsApp Web en cas de changement d’interface. Utilisez le bouton « Réessayer » dans l’overlay de l’extension.
```

---

## Finalité unique (Single purpose)

```
Détecter les numéros de téléphone dans les événements Google Calendar ouverts par l’utilisateur et faciliter la création ou l’ouverture du contact correspondant sur WhatsApp Web.
```

---

## Justifications des autorisations (onglet Confidentialité — français)

### `storage`

```
Stocker les préférences de l’utilisateur dans son navigateur : indicatif pays par défaut et suffixes optionnels pour les contacts WhatsApp (ex. nom d’équipe). Ces données restent sur l’appareil et ne sont pas envoyées à des serveurs tiers.
```

### `clipboardWrite`

```
Copier un numéro de téléphone ou des détails de contact dans le presse-papiers lorsque l’utilisateur le demande explicitement depuis l’interface de l’extension.
```

### `tabs`

```
Ouvrir ou réutiliser un onglet WhatsApp Web lorsque l’utilisateur clique sur « Créer le contact » depuis Google Calendar, et coordonner l’automatisation entre les onglets Calendar et WhatsApp.
```

### `scripting`

```
Injecter les scripts de contenu dans les onglets Google Calendar et WhatsApp Web déjà autorisés par host_permissions, uniquement pour exécuter le flux de création de contact initié par l’utilisateur.
```

### `https://calendar.google.com/*`

```
Lire les détails d’un événement affichés sur Google Calendar (titre, description, lieu, noms des participants) afin de détecter des numéos de téléphone et la date/heure du rendez-vous, uniquement lorsque l’utilisateur ouvre un événement et déclenche l’extension.
```

### `https://web.whatsapp.com/*`

```
Automatiser l’interface WhatsApp Web (recherche dans « Nouvelle discussion », ouverture d’une conversation, formulaire « Nouveau contact ») uniquement après que l’utilisateur a demandé la création de contact depuis Google Calendar.
```

---

## Justifications des autorisations (English — si la console exige l’anglais)

### `storage`

```
Store the user’s preferences in their browser: default country code and optional name suffixes for WhatsApp contacts. No data is sent to third-party servers for this storage.
```

### `clipboardWrite`

```
Copy phone numbers or contact details to the clipboard when the user explicitly requests it from the extension UI.
```

### `tabs`

```
Open or reuse a WhatsApp Web tab when the user clicks “Create contact” from Google Calendar, and coordinate automation between Calendar and WhatsApp tabs.
```

### `scripting`

```
Inject content scripts into Google Calendar and WhatsApp Web tabs already permitted by host_permissions, only to run the user-initiated contact workflow.
```

### `https://calendar.google.com/*`

```
Read event details displayed on Google Calendar (title, description, location, attendee names) to detect phone numbers and meeting date/time when the user opens an event and triggers the extension.
```

### `https://web.whatsapp.com/*`

```
Automate WhatsApp Web’s user interface (new chat search, open conversation, new contact form) only after the user requests contact creation from Google Calendar.
```

---

## Code distant (Remote code)

```
Aucun code distant n’est exécuté. Tout le JavaScript est inclus dans le package publié sur le Chrome Web Store. L’extension n’effectue aucun appel à un serveur externe pour charger ou exécuter du code.
```

*(English si requis :)*

```
No remote code is executed. All extension JavaScript is bundled in the package uploaded to the Chrome Web Store.
```

---

## Certification collecte de données

Réponses à cocher dans la console développeur :

| Question | Réponse |
|----------|---------|
| Collecte-t-elle des données utilisateur ? | **Oui** |
| Les données sont-elles chiffrées en transit ? | **Oui** (HTTPS pour Calendar et WhatsApp Web) |
| L’utilisateur peut-il demander la suppression ? | **Oui** (désinstallation + effacement des données de l’extension dans Chrome) |
| Les données sont-elles vendues ? | **Non** |
| Utilisation hors finalité de l’extension ? | **Non** |

**Types de données collectées / traitées :**

| Type | Finalité | Partagé avec des tiers ? |
|------|----------|--------------------------|
| Numéro de téléphone | Création ou ouverture du contact WhatsApp | Non (traitement local + WhatsApp Web ouvert par l’utilisateur) |
| Nom et prénom | Pré-remplissage du contact WhatsApp | Non |
| Date et heure du rendez-vous | Affichage dans l’overlay d’automatisation | Non |
| Préférences (indicatif, suffixes) | Configuration de l’extension | Non (chrome.storage local) |

**Texte de certification (champ libre) :**

```
L’extension traite les numéros de téléphone et noms issus des événements Google Calendar uniquement pour aider l’utilisateur à créer ou ouvrir un contact sur WhatsApp Web. Les données ne sont ni vendues ni utilisées à des fins publicitaires, et ne sont pas transmises à un serveur exploité par l’éditeur de l’extension.
```

*(English si requis :)*

```
The extension processes phone numbers and names from calendar events only to help the user create or open WhatsApp contacts. Data is not sold, not used for advertising, and not sent to third-party servers operated by the extension publisher.
```

---

## Google Calendar — Limited Use

```
L’utilisation par l’extension des informations reçues via Google Calendar respecte la Chrome Web Store User Data Policy, y compris les exigences Limited Use : les données du calendrier servent uniquement à la fonctionnalité affichée à l’utilisateur (détection de numéro et date de RDV), ne sont pas transférées à d’autres personnes, et ne sont pas utilisées à des fins publicitaires.
```

---

## URL politique de confidentialité

```
https://github.com/LiamReynaud/CalendarToWA/blob/main/store/POLITIQUE_CONFIDENTIALITE.fr.md
```

*(Après push sur GitHub. Alternative : héberger sur GitHub Pages ou dépôt `privacy-policies` comme les autres extensions.)*

---

## Captures d’écran — légendes (français)

1. **Détection dans Calendar** — Bannière verte sur un événement avec numéro détecté.
2. **Formulaire de contact** — Choix du prénom et du suffixe avant envoi vers WhatsApp.
3. **Automatisation WhatsApp** — Overlay avec date du RDV et statut de l’étape en cours.
4. **Nouveau contact** — Formulaire WhatsApp pré-rempli (prénom, nom).

Formats : 1280×800 ou 640×400 (minimum 1 capture).

---

## Icône

Utiliser `icons/icon128.png` inclus dans le zip (128×128).
