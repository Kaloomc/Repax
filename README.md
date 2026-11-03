# Gestion des repas

Appli web pour téléphone (PWA installable) qui :

1. garde un **budget courses** (par semaine ou par mois) ;
2. **propose les repas des 7 prochains jours** : un midi simple (salade, sandwich, wrap…) et un vrai plat le soir, à partir de recettes **Marmiton**, sans dépasser le budget ;
3. estime le **coût de chaque recette** avec les prix **Super U** relevés sur [Open Prices](https://prices.openfoodfacts.org) ;
4. génère la **liste de courses en paquets entiers** (au vrai prix du paquet), à cocher au magasin ;
5. tient un **placard virtuel** : le surplus des paquets est réutilisé dans les repas suivants, en finissant d'abord ce qui va périmer ;
6. suit **ce qui a vraiment été dépensé** et ce qui reste.

Les données sont rangées dans **Notion** (6 bases). Sans Notion configuré, l'appli tourne en **mode démo** avec 26 recettes d'exemple (données dans `data/demo.json`).

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
| 🗓️ Semaine | « Proposer les repas » remplit les 7 prochains jours (à partir du prochain repas) et la liste de courses |
| 🛒 Courses | La liste par rayon en paquets entiers, à cocher au magasin (l'article coché part au placard) ; le placard, modifiable |
| 📖 Recettes | Chercher et ajouter des recettes Marmiton (ou coller un lien), coût par portion, type de repas (🥪 midi simple / 🍲 plat du soir / les deux) modifiable |
| 🏷️ Prix | Les prix au kilo, d'où ils viennent, bouton « Actualiser depuis Open Prices », correction à la main |
| 💶 Budget | Dépenses réelles, ce qui reste sur la période, réglages (budget, personnes, midi/soir, restes) |

## D'où viennent les prix

Pour chaque ingrédient du catalogue (environ 65 produits courants, voir `ingredients.js`), dans cet ordre :

1. **ton prix**, si tu l'as saisi à la main (pastille bleue « mon prix ») ;
2. la **médiane des relevés Open Prices dans les magasins U** (Super U, U Express, Hyper U) — pastille verte « Super U » ;
3. sinon la médiane **tous magasins** — pastille orange « autre magasin » ;
4. sinon une **estimation** fixe du catalogue — pastille pointillée « estimé ».

Un ingrédient de recette que l'appli ne reconnaît pas est compté 0,50 € et marqué « non reconnu ». Sel, poivre, épices… sont comptés 0 € (rangés dans « Placard »).

Les prix Open Prices sont gardés 7 jours ; l'actualisation fait une requête par seconde au maximum.

Le coût par portion d'une recette est au prorata (pour comparer les recettes). La **liste de courses**, elle, compte des **paquets entiers** : chaque produit a une taille de paquet (pâtes 500 g, crème 20 cl, œufs par 6…) et une durée de conservation dans `ingredients.js`.

## Le placard

- Cocher un article dans la liste le fait entrer **en entier** au placard, avec une date « à finir avant ».
- Chaque repas passé (après 14 h pour le midi, 21 h pour le soir) **retire** ce qu'il a utilisé.
- Un produit entamé se garde moins longtemps (conserve ouverte : 2–3 jours, crème : 4 jours…).
- Tu peux corriger une quantité, retirer un produit ou ajouter ce que tu as déjà (« J'ai déjà 1 kg de riz »).
- Astuce : ajoute tes basiques (huile, farine, sucre…) pour qu'ils ne soient pas comptés à l'achat.

## Comment les repas sont choisis

Les 7 prochains jours à partir du prochain repas (rien pour un repas déjà passé). Pour chaque repas, dans l'ordre :

- **midi simple, soir cuisiné** : le midi, seulement des recettes « Midi simple » (ou « Les deux ») ; le soir, des « Plat du soir ». Le type est deviné à l'import (mots du nom comme salade, sandwich, wrap, croque ; difficulté et genre de plat donnés par Marmiton ; nombre d'ingrédients) et se corrige dans l'onglet Recettes ;
- **coût réel** : on pioche d'abord dans le placard, sinon on achète des paquets entiers ; le surplus va au placard pour les repas suivants ;
- **anti-gaspillage** : bonus aux recettes qui finissent ce qui est au placard, doublé pour ce qui va périmer dans les 2 jours ; l'appli prévient de ce qui risque d'être jeté ;
- **budget** : une recette n'est possible que s'il reste de quoi payer les repas suivants ;
- **variété** : une recette au plus 2 fois en 7 jours, jamais deux repas de suite, ni deux soirs (ou deux midis) de suite ;
- **restes** (option) : le plat du soir est cuisiné en double et mangé le lendemain midi ;
- un peu de **hasard**, pour que « Proposer d'autres repas » donne autre chose.

## Liens avec Agendix et Argenx

- **Agendix** dit où je suis pour chaque repas. Repax ne prévoit que les repas à Angoulême ; les autres s'affichent « Chez les parents ». Si Agendix ne répond pas, Repax prévoit tous les repas et le signale.
- **Argenx** fournit les vraies dépenses de la catégorie Courses (relevé Revolut) : elles s'ajoutent à la saisie manuelle (à garder pour le liquide).
- Repax expose `GET /api/prevision` (courses prévues sur les 7 prochains jours) pour qu'Argenx l'affiche.
- Les appels entre applis passent par l'en-tête `X-Cle-Interne` (= `CLE_INTERNE`) ; voir l'étape 9 de [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md).

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
| `CLE_INTERNE` | Clé secrète commune à Repax, Argenx et Agendix pour qu'elles se parlent sur le réseau du NAS |
| `AGENDIX_URL` | Adresse d'Agendix (ex. `http://192.168.1.45:3013`) : repas prévus seulement quand je suis à Angoulême |
| `ARGENX_URL` | Adresse d'Argenx (ex. `http://192.168.1.45:3012`) : vraies dépenses de courses par carte dans l'onglet Budget |

Au premier lancement avec Notion, l'appli **crée elle-même les 6 bases** (et ajoute les colonnes qui manquent après une mise à jour) dans la page (si elles n'y sont pas déjà), et ajoute les recettes d'exemple :

| Base | Colonnes |
|---|---|
| Produits & prix | Nom · Catégorie · Prix · Unité · Source du prix · Date du prix |
| Recettes | Nom · Lien Marmiton · Portions · Ingrédients · Temps (min) · Coût estimé · Coût par portion · Date de récupération · Type de repas · Difficulté |
| Planning des repas | Repas · Date · Moment · Recette (→ Recettes) · Coût estimé · Portions cuisinées · Restes · Consommé |
| Liste de courses | Article · Paquets · Quantité · Besoin · Unité · Produit (→ Produits) · Coût estimé · Acheté · Pour le · Source du prix |
| Garde-manger | Produit · Quantité · Unité · Acheté le · À finir avant · Origine |
| Budget & dépenses | Libellé · Type (Budget / Dépense) · Montant · Date · Période · Magasin · Personnes · Repas · Restes le midi |

Les réglages de l'appli sont la ligne de type « Budget » de la dernière base. Ne renomme pas les bases ni les colonnes : l'appli les retrouve par leur nom.

Mise en place pas à pas : voir [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md).

## Mise en ligne

Sur le NAS Synology, comme le jeu Gorgée : `docker-compose.yml` à coller dans Container Manager, proxy inversé HTTPS sur le port 8444. Adresse finale : https://teranga-nas.synology.me:8444. Guide complet : [docs/MISE-EN-LIGNE.md](docs/MISE-EN-LIGNE.md).

## Organisation du code

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur Express : interface et routes `/api/...`, mot de passe |
| `store.js` | Schéma des 6 bases ; stockage mode démo (fichier JSON) |
| `notion.js` | Stockage Notion (API officielle, création des bases) |
| `ingredients.js` | Catalogue d'ingrédients (prix, paquets, conservation), lecture des lignes de recette, calcul des coûts |
| `prix.js` | Récupération des prix Open Prices |
| `marmiton.js` | Recherche et lecture des recettes Marmiton |
| `planning.js` | Choix des repas sur 7 jours, achat par paquets, placard, type de plat |
| `demo-recettes.json` | Recettes d'exemple |
| `public/` | Interface (HTML, CSS, JS), manifest PWA, service worker, icônes |
| `test.js` | Tests (`npm test`) |
