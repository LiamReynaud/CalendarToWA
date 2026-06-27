# Calendar to WhatsApp

Extension Chrome qui détecte automatiquement les numéros de téléphone dans vos événements **Google Calendar** et propose de créer un contact sur **WhatsApp Web**.

## Fonctionnement

1. Ouvrez un événement dans [Google Calendar](https://calendar.google.com) (titre, description, lieu, notes…).
2. Si un numéro est détecté (ex. `06 12 34 56 78`, `+33 6 12 34 56 78`), une bannière verte apparaît.
3. Cliquez sur **Créer le contact** : WhatsApp Web s’ouvre et l’extension tente d’ouvrir le formulaire « Nouveau contact » avec le nom de la réunion et le numéro pré-remplis.
4. Vérifiez les informations puis enregistrez le contact dans WhatsApp.

## Installation (mode développeur)

1. Clonez ou téléchargez ce dépôt.
2. Ouvrez Chrome → `chrome://extensions/`
3. Activez le **Mode développeur** (en haut à droite).
4. Cliquez sur **Charger l’extension non empaquetée**.
5. Sélectionnez le dossier `CalendarToWA`.

## Configuration

Cliquez sur l’icône de l’extension dans la barre d’outils pour définir l’**indicatif pays par défaut** (33 pour la France). Il est utilisé quand un numéro local est détecté sans `+` (ex. `0612345678` → `33612345678`).

## Formats de numéros reconnus

- Mobiles français : `06`, `07` (avec ou sans espaces/points/tirets)
- Fixes français : `01` à `05`
- International : `+33…`, `+32…`, etc.

## Limites connues

- **WhatsApp Web** ne propose pas d’URL officielle pour créer un contact. L’extension automatise l’interface (Nouvelle discussion → Nouveau contact) ; selon votre version de WhatsApp et votre appareil lié, le pré-remplissage peut nécessiter une saisie manuelle.
- L’interface de Google Calendar change régulièrement ; la détection s’appuie sur les panneaux d’événements visibles (`role="dialog"`).
- La fonction « Nouveau contact » sur WhatsApp Web dépend de votre compte (disponible progressivement depuis fin 2024).

En cas d’échec de l’automatisation, un overlay propose d’**ouvrir directement la conversation** avec le numéro via `web.whatsapp.com/send?phone=…`.

## Structure du projet

```
CalendarToWA/
├── manifest.json          # Manifest V3
├── background.js          # Ouverture WhatsApp + stockage temporaire
├── lib/phone-utils.js     # Détection et normalisation des numéros
├── content/
│   ├── calendar.js        # Script injecté dans Google Calendar
│   ├── calendar.css
│   ├── whatsapp.js        # Script injecté dans WhatsApp Web
│   └── whatsapp.css
├── popup/                 # Paramètres (indicatif pays)
└── icons/
```

## Développement

Rechargez l’extension sur `chrome://extensions/` après chaque modification de code.

## Licence

MIT
