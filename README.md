# Gestion des repas

Appli web pour téléphone (PWA installable) qui :

1. garde un **budget courses** (par semaine ou par mois) ;
2. **propose les repas de la semaine** (midi et soir) à partir de recettes **Marmiton**, sans dépasser le budget ;
3. estime le **coût de chaque recette** avec les prix **Super U** relevés sur [Open Prices](https://prices.openfoodfacts.org) ;
4. génère la **liste de courses** avec le total estimé, à cocher au magasin ;
5. suit **ce qui a vraiment été dépensé** et ce qui reste.

Les données sont rangées dans **Notion** (5 bases). Sans Notion configuré, l'appli tourne en **mode démo** avec 16 recettes d'exemple (données dans `data/demo.json`).

Pas d'IA : les repas sont choisis par règles simples, expliquées plus bas.

## Lancer en local

Il faut Node.js 20 ou plus récent.

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3011. Tests : `npm test`.

## Les onglets

| Onglet | Ce qu'on y fait |
|---|---|
| 🗓️ Semaine | « Proposer les repas » remplit les 14 repas de la semaine (ou de la suivante) et la liste de courses |
| 🛒 Courses | La liste par rayon, à cocher au magasin ; total estimé et reste à acheter |
| 📖 Recettes | Chercher et ajouter des recettes Marmiton (ou coller un lien), voir le coût par portion et le détail ligne par ligne |
| 🏷️ Prix | Les prix au kilo, d'où ils viennent, bouton « Actualiser depuis Open Prices », correction à la main |
| 💶 Budget | Dépenses réelles, ce qui reste sur la période, réglages (budget, personnes, midi/soir) |

## D'où viennent les prix

Pour chaque ingrédient du catalogue (environ 65 produits courants, voir `ingredients.js`), dans cet ordre :

1. **ton prix**, si tu l'as saisi à la main (pastille bleue « mon prix ») ;
2. la **médiane des relevés Open Prices dans les magasins U** (Super U, U Express, Hyper U) — pastille verte « Super U » ;
3. sinon la médiane **tous magasins** — pastille orange « autre magasin » ;
4. sinon une **estimation** fixe du catalogue — pastille pointillée « estimé ».

Un ingrédient de recette que l'appli ne reconnaît pas est compté 0,50 € et marqué « non reconnu ». Sel, poivre, épices… sont comptés 0 € (rangés dans « Placard »).

Les prix Open Prices sont gardés 7 jours ; l'actualisation fait une requête par seconde au maximum.

> Les quantités sont calculées au prorata (il faut 300 g de pâtes → on compte 300 g, pas le paquet de 1 kg). Le vrai ticket de caisse sera donc un peu plus élevé que l'estimation, mais il te restera des provisions.

## Comment les repas sont choisis

Pour chaque repas de la semaine, dans l'ordre :

- **budget** : une recette n'est possible que s'il reste assez d'argent pour elle *et* pour les repas suivants (au prix de la recette la moins chère) ;
- **variété** : une même recette au plus 2 fois par semaine, jamais deux repas de suite ;
- **anti-gaspillage** : bonus aux recettes qui réutilisent des ingrédients déjà prévus ou déjà cochés comme achetés ;
- un peu de **hasard**, pour que « Proposer d'autres repas » donne autre chose.

## Marmiton : à savoir

Marmiton n'a **pas d'API officielle**. L'appli lit les pages publiques avec parcimonie : une requête toutes les 3 secondes, un user-agent qui dit qui elle est, la première page de recherche seulement (comme le demande leur `robots.txt`), recherches gardées 24 h, et chaque recette est enregistrée pour ne jamais redemander la même page.

⚠️ **Si Marmiton change son site, la recherche ou l'import peuvent cesser de marcher.** Les recettes déjà enregistrées restent utilisables. La lecture s'appuie sur les données structurées standard (schema.org `Recipe`) présentes dans chaque page, ce qui limite ce risque.

## Notion

Variables d'environnement (jamais dans le dépôt) :

| Variable | Rôle |
|---|---|
| `NOTION_TOKEN` | Jeton de ton intégration Notion. Vide = mode démo |
| `NOTION_PAGE_ID` | Page Notion qui accueille les bases |
| `APP_PASSWORD` | Mot de passe de l'appli (conseillé dès qu'elle est sur Internet) |
| `PORT` | Port du serveur (3011 par défaut) |

Au premier lancement avec Notion, l'appli **crée elle-même les 5 bases** dans la page (si elles n'y sont pas déjà), et ajoute les recettes d'exemple :

| Base | Colonnes |
|---|---|
| Produits & prix | Nom · Catégorie · Prix · Unité · Source du prix · Date du prix |
| Recettes | Nom · Lien Marmiton · Portions · Ingrédients · Temps (min) · Coût estimé · Coût par portion · Date de récupération |
| Planning des repas | Repas · Date · Moment · Recette (→ Recettes) · Semaine · Coût estimé |
| Liste de courses | Article · Quantité · Unité · Produit (→ Produits) · Coût estimé · Acheté · Semaine · Source du prix |
| Budget & dépenses | Libellé · Type (Budget / Dépense) · Montant · Date · Période · Magasin · Personnes · Repas |

Les réglages de l'appli sont la ligne de type « Budget » de la dernière base. Ne renomme pas les bases ni les colonnes : l'appli les retrouve par leur nom.

Mise en place pas à pas : voir [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md).

## Mise en ligne

Sur le NAS Synology, comme le jeu Gorgée : `docker-compose.yml` à coller dans Container Manager, proxy inversé HTTPS sur le port 8444. Adresse finale : https://teranga-nas.synology.me:8444. Guide complet : [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md).

## Organisation du code

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur Express : interface et routes `/api/...`, mot de passe |
| `store.js` | Schéma des 5 bases ; stockage mode démo (fichier JSON) |
| `notion.js` | Stockage Notion (API officielle, création des bases) |
| `ingredients.js` | Catalogue d'ingrédients, lecture des lignes de recette, calcul des coûts |
| `prix.js` | Récupération des prix Open Prices |
| `marmiton.js` | Recherche et lecture des recettes Marmiton |
| `planning.js` | Choix des repas et liste de courses |
| `demo-recettes.json` | Recettes d'exemple |
| `public/` | Interface (HTML, CSS, JS), manifest PWA, service worker, icônes |
| `test.js` | Tests (`npm test`) |
