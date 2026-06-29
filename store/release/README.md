# Première publication Chrome Web Store

## Fichier à uploader

Utilisez le zip de cette version :

```
CalendarToWA-chrome-store-1.9.9.zip
```

Généré par :

```bash
npm run package:chrome-store
```

## Étapes

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Nouvel élément** → Extension
2. Upload du zip ci-dessus
3. Remplir la fiche avec les textes de [`../CHROME_WEB_STORE.md`](../CHROME_WEB_STORE.md)
4. Politique de confidentialité : [`../PRIVACY.fr.md`](../PRIVACY.fr.md) (URL GitHub raw ou Pages)
5. Noter l’**Extension ID** (32 caractères)
6. `cp ../../.env.chrome-store.example ../../.env.chrome-store` et renseigner `CWS_EXTENSION_ID` (+ OAuth partagés Alegria/calendly)
7. `./scripts/setup-github-cws-secrets.sh` pour activer le déploiement GitHub Actions
8. Soumettre pour examen

## Déploiements suivants

```bash
npm run publish:chrome-store:release
# ou
git tag v1.9.10 && git push origin v1.9.10
```
