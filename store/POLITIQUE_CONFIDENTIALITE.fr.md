# Politique de confidentialité — Extension Calendar to WhatsApp

**Dernière mise à jour :** 29 juin 2026  
**Extension :** Calendar to WhatsApp  
**Éditeur :** Liam Reynaud / BAVASAK  
**Contact :** via le dépôt GitHub [LiamReynaud/CalendarToWA](https://github.com/LiamReynaud/CalendarToWA/issues)

---

## 1. Objet

La présente politique de confidentialité décrit comment l’extension Chrome **Calendar to WhatsApp** (ci-après « l’Extension ») traite les informations lorsque vous l’utilisez pour détecter des numéros de téléphone dans Google Calendar et créer ou ouvrir des contacts sur WhatsApp Web.

L’Extension ne revend pas vos données et ne les utilise pas à des fins publicitaires.

---

## 2. Responsable du traitement

Pour l’Extension elle-même, le responsable est :

**Liam Reynaud / BAVASAK**  
Contact : [GitHub Issues — CalendarToWA](https://github.com/LiamReynaud/CalendarToWA/issues)

Les données de contact créées ou modifiées dans WhatsApp relèvent de votre compte WhatsApp et de votre organisation.

---

## 3. Données traitées

L’Extension peut traiter les catégories de données suivantes, **uniquement lorsque vous ouvrez un événement Google Calendar et déclenchez l’Extension** :

| Donnée | Source | Usage |
|--------|--------|-------|
| Numéro de téléphone | Événement Google Calendar (titre, description, lieu, notes…) | Recherche et création/ouverture du contact sur WhatsApp Web |
| Nom et prénom | Événement Calendar et/ou saisie utilisateur dans l’Extension | Pré-remplissage du contact WhatsApp |
| Date et heure du rendez-vous | Événement Google Calendar | Affichage dans l’overlay d’automatisation (rappel du RDV) |
| Suffixe équipe (ex. Alegria) | Saisie utilisateur | Complément du nom de contact WhatsApp |

**Données de configuration** (stockées localement dans Chrome, sur votre appareil) :

- Indicatif pays par défaut (ex. 33 pour la France)  
- Liste de suffixes enregistrés  
- Contact en cours de traitement (temporaire, le temps de l’automatisation)  

Ces éléments ne sont **pas** transmis à un serveur exploité par l’éditeur de l’Extension.

---

## 4. Finalités du traitement

Les données sont traitées **exclusivement** pour :

1. Détecter un numéro de téléphone dans un événement Google Calendar que vous consultez ;
2. Ouvrir WhatsApp Web et automatiser la recherche du numéro ;
3. Créer un nouveau contact ou ouvrir une discussion existante, selon le résultat de la recherche WhatsApp ;
4. Afficher l’état d’avancement et la date du rendez-vous pendant l’automatisation.

Aucune analyse marketing, profilage publicitaire ou revente de données n’est effectuée.

---

## 5. Base légale (RGPD)

Selon votre contexte d’utilisation :

- **Exécution d’une mission professionnelle** (intérêt légitime de l’employeur ou de l’équipe commerciale) ;
- et/ou **Consentement** de l’utilisateur de l’Extension lors de chaque action volontaire (« Créer le contact »).

Les données des personnes contactées via WhatsApp sont généralement collectées par votre organisation dans le cadre de la prise de rendez-vous ; l’Extension ne fait que faciliter le passage du calendrier à WhatsApp.

---

## 6. Fonctionnement technique et destinataires

### 6.1. Stockage local (Chrome)

La configuration et les données temporaires de session sont enregistrées via l’API `chrome.storage` de votre navigateur. Elles restent sur votre appareil tant que vous ne désinstallez pas l’Extension ou n’effacez pas ses données.

Le contact en cours expire automatiquement après quelques minutes ou à la fermeture de l’overlay.

### 6.2. Google Calendar

L’Extension lit le contenu des pages Google Calendar que **vous** ouvrez dans Chrome, uniquement pour détecter des numéros et la date du rendez-vous. Aucune clé API Google Calendar n’est utilisée : l’Extension lit le DOM de la page affichée.

Google est un service tiers soumis à sa propre politique : https://policies.google.com/privacy

### 6.3. WhatsApp Web

L’Extension interagit avec l’interface WhatsApp Web que **vous** ouvrez, pour rechercher un numéro et remplir un formulaire de contact. Les données saisies dans WhatsApp sont gérées par Meta/WhatsApp selon leurs conditions.

WhatsApp Privacy Policy : https://www.whatsapp.com/legal/privacy-policy

### 6.4. Absence de serveur intermédiaire éditeur

L’Extension **ne transmet pas** vos données à un serveur exploité par l’éditeur. Tout le traitement s’effectue dans votre navigateur, entre Google Calendar et WhatsApp Web.

---

## 7. Google Calendar — Limited Use

L’utilisation par l’Extension des informations reçues via Google Calendar respecte la [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), y compris les exigences **Limited Use** :

- les données du calendrier servent uniquement à la fonctionnalité affichée à l’utilisateur ;
- elles ne sont pas transférées à d’autres personnes (hors WhatsApp Web ouvert par l’utilisateur) ;
- elles ne sont pas utilisées à des fins publicitaires.

---

## 8. Durée de conservation

| Emplacement | Durée |
|-------------|-------|
| Configuration dans Chrome | Jusqu’à désinstallation de l’Extension ou suppression manuelle des données |
| Contact en cours (automation) | Quelques minutes maximum |
| Contacts WhatsApp | Selon votre compte WhatsApp et vos pratiques |

L’Extension ne maintient pas de base de données centralisée.

---

## 9. Sécurité

- Les pages Google Calendar et WhatsApp Web communiquent en **HTTPS**.  
- Aucun code JavaScript distant n’est chargé dynamiquement ; le code est intégré au package publié sur le Chrome Web Store.  
- Les préférences restent locales à votre profil Chrome.

---

## 10. Vos droits (RGPD)

Conformément au Règlement général sur la protection des données (UE 2016/679), vous disposez des droits suivants **en tant qu’utilisateur de l’Extension** :

- **Accès** et **rectification** : via les paramètres de l’Extension (popup) ou la suppression des données dans Chrome ;
- **Effacement** : désinstallez l’Extension et supprimez les données associées dans `chrome://extensions` ;
- **Limitation** et **opposition** : cessez d’utiliser l’Extension ;
- **Portabilité** : export possible depuis WhatsApp pour les contacts que vous y avez enregistrés.

Pour les données des personnes contactées, adressez-vous au responsable du traitement au sein de votre organisation.

Vous pouvez introduire une réclamation auprès de la CNIL (France) : https://www.cnil.fr

---

## 11. Données des mineurs

L’Extension n’est pas destinée à un usage par des personnes de moins de 16 ans. Elle est conçue pour un contexte professionnel.

---

## 12. Modifications

Nous pouvons mettre à jour cette politique pour refléter des évolutions de l’Extension ou des obligations légales. La date de « Dernière mise à jour » en tête de document sera révisée.

---

## 13. Contact

Pour toute question relative à cette politique :

**GitHub Issues :** https://github.com/LiamReynaud/CalendarToWA/issues

---

## English summary

Calendar to WhatsApp runs entirely in your browser. It reads Google Calendar event content and automates WhatsApp Web only when you trigger contact creation. No personal data is sent to the extension publisher’s servers. Preferences are stored locally via chrome.storage.
