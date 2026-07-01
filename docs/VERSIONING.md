# Versionnement — CalendarToWA

Schéma **A.B.C** (semver) — règle globale : `~/.cursor/skills/versioning-abc/SKILL.md`

| Contexte | Chiffre | Exemple |
|----------|---------|---------|
| **Version locale** (dev, fix) | **C** (dernier) | `1.9.10` → `1.9.11` |
| **Version déployée** (Chrome Web Store) | **B** (second), C=0 | `1.9.11` → `1.10.0` |
| **Majeur** (sur demande) | **A** (premier) | `1.10.0` → `2.0.0` |

## Fichiers à synchroniser

- `manifest.json`
- `package.json`
- `content/whatsapp.js` (`SCRIPT_ID`)

## Commandes

```bash
npm run version:bump        # +C (local)
npm run version:bump:cws    # +B, C=0 (Chrome Web Store)
npm run version:bump:major  # +A (sur demande)
npm run check:versions      # vérifie manifest ↔ package ↔ SCRIPT_ID
```

## Fin de tâche (obligatoire)

Toute modif de `content/`, `background.js`, `popup/`, `lib/` → **bump + check** avant de terminer.

Hook Cursor `stop` : rappel automatique si oubli.
