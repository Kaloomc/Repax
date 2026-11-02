# Gestion des repas

Appli web (installable sur téléphone) pour :

1. fixer un budget courses (par semaine ou par mois) ;
2. proposer les repas de la semaine (midi et soir) à partir de recettes Marmiton, sans dépasser le budget ;
3. estimer le coût de chaque recette avec les prix Super U d'[Open Prices](https://prices.openfoodfacts.org) ;
4. générer la liste de courses avec le total estimé ;
5. suivre ce qui a vraiment été dépensé et ce qui reste.

Les données sont rangées dans **Notion**. Sans Notion configuré, l'appli tourne en **mode démo** (données dans `data/demo.json`).

## Lancer en local

Il faut Node.js 20 ou plus récent.

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3011.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur Express : sert l'interface et les routes `/api/...` |
| `store.js` | Lecture et écriture des données (mode démo pour l'instant, Notion ensuite) |
| `public/` | Interface (HTML, CSS, JS), manifest PWA, service worker et icônes |

## Avancement

- [x] Étape 1 : squelette, PWA installable, mode démo, réglages
- [ ] Étape 2 : prix Open Prices
- [ ] Étape 3 : recettes Marmiton
- [ ] Étape 4 : planning de la semaine et liste de courses
- [ ] Étape 5 : suivi du budget
- [ ] Étape 6 : bases Notion
- [ ] Étape 7 : mise en ligne sur le NAS (`docker-compose.yml` et guide)
