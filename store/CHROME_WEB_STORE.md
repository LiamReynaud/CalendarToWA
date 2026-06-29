# Chrome Web Store — Fiche extension Calendar to WhatsApp

Archive à publier : `dist/CalendarToWA-chrome-store-<version>.zip`  
Première soumission manuelle : `store/release/<version>/CalendarToWA-chrome-store-<version>.zip`  
Commande : `npm run package:chrome-store`  
Console : https://chrome.google.com/webstore/devconsole

---

## Identité

| Champ | Valeur |
|-------|--------|
| **Nom** (45 car. max) | Calendar to WhatsApp |
| **Langue principale** | Français |
| **Catégorie** | Productivité |
| **Visibilité recommandée** | Non répertorié (usage équipe) — ou Public si diffusion ouverte |

---

## Descriptions (français)

### Résumé (132 caractères max)

```
Détecte les numéros dans Google Calendar et ouvre WhatsApp Web pour créer ou retrouver le contact du rendez-vous.
```

### Description détaillée

```
Calendar to WhatsApp relie vos rendez-vous Google Calendar à WhatsApp Web pour gagner du temps lors de la prise de contact.

À QUOI SERT CETTE EXTENSION ?

• Détecter automatiquement les numéros de téléphone dans un événement Google Calendar (titre, description, lieu, invités…)
• Proposer la création ou l’ouverture du contact correspondant sur WhatsApp Web
• Pré-remplir le prénom, le nom (suffixe équipe) et afficher la date/heure du RDV pendant l’automatisation

FONCTIONNEMENT

1. Ouvrez un événement dans Google Calendar contenant un numéro de mobile.
2. Une bannière « Calendar to WhatsApp » apparaît avec le numéro détecté.
3. Choisissez le prénom et le suffixe (ex. Alegria), puis cliquez « Créer le contact ».
4. WhatsApp Web s’ouvre : l’extension recherche le numéro, ouvre la discussion ou le formulaire « Nouveau contact », puis remplit les champs.
5. Vérifiez et enregistrez le contact dans WhatsApp si nécessaire.

PRÉREQUIS

• Google Calendar ouvert dans Chrome
• WhatsApp Web connecté sur le même navigateur
• Pour les nouveaux contacts : fonction « Ajouter un contact » disponible sur votre compte WhatsApp Web

SÉCURITÉ

• L’extension lit uniquement le contenu des pages Google Calendar et WhatsApp Web que vous consultez.
• La configuration (indicatif pays, suffixes) est stockée localement dans Chrome (chrome.storage).
• Aucune donnée n’est envoyée à un serveur tiers : tout s’exécute dans votre navigateur.

LIMITES

• WhatsApp Web ne propose pas d’URL officielle de création de contact : l’extension automatise l’interface, qui peut varier selon les versions.
• En cas d’échec, un overlay propose de réessayer ou d’ouvrir la conversation manuellement.

SUPPORT

Rechargez l’extension et WhatsApp Web en cas de changement d’interface. Utilisez le bouton « Réessayer » dans l’overlay de l’extension.
```

### Finalité unique (Single purpose)

```
Cette extension a une seule finalité : détecter les numéros de téléphone dans les événements Google Calendar ouverts par l’utilisateur et faciliter la création ou l’ouverture du contact correspondant sur WhatsApp Web.
```

---

## Captures d’écran — légendes suggérées

1. Bannière de détection sur un événement Google Calendar
2. Choix du prénom et du suffixe avant envoi vers WhatsApp
3. Overlay d’automatisation sur WhatsApp Web avec date du RDV
4. Formulaire « Nouveau contact » pré-rempli

Formats acceptés : 1280×800 ou 640×400 (minimum 1 capture).

---

## Confidentialité

Texte complet : **`PRIVACY.fr.md`** (politique à héberger en URL publique, ex. GitHub Pages ou dépôt `privacy-policies`).

### Permission justifications (English — Developer Console)

#### `storage`

```
Store the user’s preferences in their browser: default country code and optional name suffixes for WhatsApp contacts. No data is sent to third-party servers for this storage.
```

#### `clipboardWrite`

```
Copy phone numbers or contact details to the clipboard when the user explicitly requests it from the extension UI.
```

#### `tabs`

```
Open or reuse a WhatsApp Web tab when the user clicks “Create contact” from Google Calendar, and coordinate automation between Calendar and WhatsApp tabs.
```

#### `scripting`

```
Inject content scripts into Google Calendar and WhatsApp Web tabs already permitted by host_permissions, only to run the user-initiated contact workflow.
```

#### `https://calendar.google.com/*`

```
Read event details displayed on Google Calendar (title, description, location, attendee names) to detect phone numbers and meeting date/time when the user opens an event and triggers the extension.
```

#### `https://web.whatsapp.com/*`

```
Automate WhatsApp Web’s user interface (new chat search, open conversation, new contact form) only after the user requests contact creation from Google Calendar.
```

### Remote code

```
No remote code is executed. All extension JavaScript is bundled in the package uploaded to the Chrome Web Store.
```

### Data collection certification

```
The extension processes phone numbers and names from calendar events only to help the user create or open WhatsApp contacts. Data is not sold, not used for advertising, and not sent to third-party servers.
```

### Privacy policy URL

```
https://github.com/LiamReynaud/CalendarToWA/blob/main/store/PRIVACY.fr.md
```

*(Ou URL GitHub Pages / privacy-policies si vous centralisez comme les autres extensions.)*

---

## Publication — première fois

1. **Developer Dashboard** : https://chrome.google.com/webstore/devconsole → **Nouvel élément** → Extension.
2. **Upload manuel** du zip `store/release/1.9.9/CalendarToWA-chrome-store-1.9.9.zip`.
3. Remplir la fiche (textes ci-dessus, icônes 16/48/128 incluses, captures).
4. Noter l’**ID extension** (32 lettres) → `.env.chrome-store` → `CWS_EXTENSION_ID`.
5. Copier les OAuth depuis Alegria / calendly (`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`).
6. Soumettre pour examen.

## Publication — automatique (après première fiche)

### Local

```bash
cp .env.chrome-store.example .env.chrome-store   # remplir CWS_*
npm run publish:chrome-store                       # brouillon (upload)
npm run publish:chrome-store:release               # upload + soumission examen
```

### GitHub Actions

```bash
./scripts/setup-github-cws-secrets.sh
# Manuel : Actions → Publish to Chrome Web Store → upload
git tag v1.9.9 && git push origin v1.9.9           # publish automatique
```

Secrets requis : `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID`.

OAuth : réutiliser le **même projet Google Cloud** que Alegria_G_Sheet / calendly_to_gsheet (API Chrome Web Store activée).

---

## Checklist avant soumission

- [ ] `npm run package:chrome-store` → zip créé dans `dist/` et `store/release/<version>/`
- [ ] Icônes 16 / 48 / 128 présentes
- [ ] Première fiche créée + `CWS_EXTENSION_ID` renseigné
- [ ] Secrets GitHub configurés (`./scripts/setup-github-cws-secrets.sh`)
- [ ] Politique de confidentialité accessible (URL dans la fiche)
- [ ] Au moins 1 capture d’écran
- [ ] Justifications des permissions (English) copiées dans la console
