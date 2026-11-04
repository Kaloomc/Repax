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
| Semaine | Jauge « reste sur le budget » (verte, orange au-delà de 80 %, rouge si dépassé), puis les repas jour par jour (« Aujourd'hui », « Demain »…, total du jour). Les repas d'aujourd'hui restent affichés toute la journée. Toucher un repas ouvre sa **fiche** ; le bouton « ⋯ » donne les actions avec leur libellé : épingler, remplacer, mangé ailleurs. « Proposer d'autres repas » et « Remplacer » peuvent être **annulés** (toast) |
| Courses | « Reste à acheter », « Déjà pris », articles cochés ; liste par rayon (ordre du Super U) ou par jour ; grande case ronde, les articles cochés descendent dans « Dans le panier ». Mode magasin (gros texte, écran allumé), partage de la liste, article libre, placard repliable |
| Recettes | Recherche Marmiton (ou lien collé → « Importer cette recette »), filtres Faisable chez moi / Rapide / Végé / Pas cher / Avec mon stock / Favoris, ⭐ favoris, « À vérifier » ; les recettes impossibles (four, je n'aime pas) sont repliées dans « Non réalisables » |
| Prix | Liste cherchable, source et date de chaque prix, « ≈ » pour une estimation, alerte « Ancien » après 60 jours, mon prix dans une feuille |
| Budget | Reste / payé sur la période, 8 dernières semaines (prévu, payé, budget), projection de fin de mois, dépenses, réglages |

La **fiche recette** (feuille qui monte du bas) montre la photo, la durée, la difficulté, le coût par portion, les ingrédients avec **tes** quantités et les étapes, avec « Mode cuisine » (une étape par écran, texte grand, écran allumé) et « Ajouter au planning » (le repas choisi est remplacé et épinglé).

Le bouton en haut à droite règle le **thème** (auto / clair / sombre) ; la puce « Démo » ou « Notion » explique d'où viennent les données.

## Interface

HTML, CSS et JS simples (aucune compilation). Le design repose sur des variables CSS dans `public/style.css` (couleurs, espacements sur une grille de 8 px, arrondis, ombres, durées, échelle de texte 12/14/16/20/28) avec un thème clair et un thème sombre ; icônes [Lucide](https://lucide.dev) (licence ISC) dans `public/index.html`. Zones tactiles d'au moins 44 px, zones sûres de l'iPhone, `prefers-reduced-motion` respecté. Captures avant / après : `docs/captures/`.

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

- **ce que je n'aime pas / ce que je n'ai pas** : une recette dont le nom ou les ingrédients contiennent un mot exclu (réglage « Je n'aime pas », par défaut omelette, soupe, velouté, fruits de mer — qui compte crevettes, moules, calamars…) ou qui demande un four (« Pas de four » : four, préchauffer, enfourner, gratin, tarte, quiche…) n'est **jamais proposée**. Un repas déjà prévu avec une telle recette est remplacé, sauf s'il est 📌 gardé ;

- **midi simple, soir cuisiné** : le midi, seulement des recettes « Midi simple » (ou « Les deux ») ; le soir, des « Plat du soir ». Le type est deviné à l'import (mots du nom comme salade, sandwich, wrap, croque ; difficulté et genre de plat donnés par Marmiton ; nombre d'ingrédients) et se corrige dans l'onglet Recettes ;
- **coût réel** : on pioche d'abord dans le placard, sinon on achète des paquets entiers ; le surplus va au placard pour les repas suivants ;
- **anti-gaspillage** : bonus aux recettes qui finissent ce qui est au placard, doublé pour ce qui va périmer dans les 2 jours ; l'appli prévient de ce qui risque d'être jeté ;
- **budget** : une recette n'est possible que s'il reste de quoi payer les repas suivants ;
- **variété** : une recette au plus 2 fois en 7 jours, jamais deux repas de suite, ni deux soirs (ou deux midis) de suite ;
- **restes** (option) : le plat du soir est cuisiné en double et mangé le lendemain midi ;
- un peu de **hasard**, pour que « Proposer d'autres repas » donne autre chose.

## Mode automatique

Repax remplace la tâche planifiée « Planning repas quotidien ». **Toutes les 10 minutes, et 2 secondes après chaque action dans l'appli**, il :

1. range le Garde-manger (noms et unités du catalogue : « Spaghetti 0,5 kg » devient « Pâtes ») et y met les articles cochés « Acheté » directement dans Notion ;
2. retire du placard ce qu'ont utilisé les repas passés (case Consommé) ;
3. **complète** le planning jusqu'aux 7 prochains jours **sans toucher aux repas existants** (ceux ajoutés à la main dans Notion compris), en ignorant les absences (Présence) et les repas « mangé ailleurs », puis refait la liste de courses ;
4. remplit les colonnes vides des recettes (Type de repas, Difficulté, Coût estimé, Coût par portion), 20 par passage.

Ne sont jamais touchés : une ligne du planning **sans recette** (« resto avec Paul », ajoutée à la main) et une ligne de courses **sans « Source du prix »** (ajoutée à la main). Un article coché reste dans la liste le jour même et le lendemain, puis la quitte (il est au placard).

« Coût estimé » d'un repas = le prix des ingrédients mangés, au prorata ; la liste de courses, elle, compte les paquets entiers.

Les modifications faites directement dans Notion sont vues au plus tard 10 minutes après (cache).

## Liens avec Agendix et Argenx

Les trois applis ne se parlent pas directement : elles partagent **la même page Notion** (même `NOTION_TOKEN` et même `NOTION_PAGE_ID`), chacune y range ses bases et lit celles des autres.

- **Agendix** remplit la base « Présence » : où je suis pour chaque repas. Repax ne prévoit que les repas à Angoulême ; les autres s'affichent « Chez les parents ». Sans cette base, Repax prévoit tous les repas.
- **Argenx** remplit la base « Courses payées » : les vraies dépenses de la catégorie Courses (relevé Revolut). Elles s'ajoutent à la saisie manuelle (à garder pour le liquide).
- **Argenx** lit « Liste de courses » et « Planning des repas » pour afficher les courses prévues.
- En mode démo (sans Notion), Repax fonctionne seul.

## Widget iPhone (Scriptable)

`GET /api/widget/repas` renvoie, en lecture seule, de quoi remplir un widget d'écran d'accueil : le prochain repas, celui d'après et les courses à faire. Il ne lit **jamais Notion** : il répond avec ce que l'appli a déjà en mémoire (rafraîchi toutes les 10 minutes par le mode automatique et à chaque action), donc une réponse en quelques millisecondes et aucun quota Notion consommé. Seul « le prochain repas » est recalculé à l'heure de la requête : le midi reste le prochain jusqu'à 14 h, le soir jusqu'à 21 h, tant qu'il n'est pas coché `Consommé` ; un repas mangé ailleurs ou pendant une absence (base « Présence » : « Parents », « Ailleurs » ; « Angoulême » n'est pas une absence) est ignoré.

**Protection** : un jeton propre au widget, indépendant du mot de passe de l'appli. Sans lui, la route répond `404` (désactivée) ; avec un jeton absent ou faux, `401` sans corps ; au-delà de 60 requêtes par heure, `429` (et 20 jetons faux par heure et par adresse). Pour le changer ou le révoquer, modifie `WIDGET_TOKEN` et redémarre : l'ancien cesse aussitôt de marcher.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # génère un jeton
```

Mets-le dans `WIDGET_TOKEN` (voir `docker-compose.yml`). L'adresse doit être en **HTTPS** (le jeton circule dans l'en-tête), joignable depuis Internet comme le reste de l'appli : `https://teranga-nas.synology.me:8444/api/widget/repas`.

```bash
curl -H "Authorization: Bearer <jeton>" https://teranga-nas.synology.me:8444/api/widget/repas
```

```json
{
  "updatedAt": "2026-11-04T21:30:00+01:00",
  "next":  { "date": "2026-11-05", "moment": "midi", "name": "Croque-monsieur et salade", "minutes": 20, "cost": 1.76 },
  "after": { "date": "2026-11-05", "moment": "soir", "name": "Poulet au curry et riz", "minutes": 35, "cost": 3.55 },
  "shopping": { "toBuyCount": 8, "urgentCount": 2, "urgent": [ { "name": "Pain", "neededOn": "2026-11-05" } ] }
}
```

- `updatedAt` : moment du dernier instantané, heure de Paris. `503` juste après un redémarrage, le temps du premier passage (quelques secondes).
- `next` / `after` : `null` s'il n'y a rien de planifié. `after` est le repas planifié qui suit `next`. `minutes` est `null` pour un repas noté à la main (sans recette).
- `toBuyCount` : articles non cochés « Acheté », hors « placard » (sel, poivre…).
- `urgent` : au plus 3 articles dont le premier repas qui les utilise (d'après le planning réel, pas la colonne « Pour le » qui peut être périmée) est aujourd'hui ou demain, triés par date puis par nom ; `urgentCount` en donne le total.

**Installation sur l'iPhone** (appli gratuite Scriptable) :

1. Dans Scriptable, crée un script, colle le contenu du fichier `widget-repas.js` et renseigne `BASE_URL` et `TOKEN` en haut.
2. Lance le script une fois pour voir l'aperçu.
3. Sur l'écran d'accueil : appui long, « + », Scriptable, choisis le script. Les tailles petite, moyenne et grande, et les accessoires de l'écran verrouillé, sont pris en charge.
4. Un appui sur le widget ouvre l'appli.

## Marmiton : à savoir

Marmiton n'a **pas d'API officielle**. L'appli lit les pages publiques avec parcimonie : une requête toutes les 3 secondes, un user-agent qui dit qui elle est, la première page de recherche seulement (comme le demande leur `robots.txt`), recherches gardées 24 h, et chaque recette est enregistrée pour ne jamais redemander la même page.

⚠️ **Si Marmiton change son site, la recherche ou l'import peuvent cesser de marcher.** Les recettes déjà enregistrées restent utilisables. La lecture s'appuie sur les données structurées standard (schema.org `Recipe`) présentes dans chaque page, ce qui limite ce risque.

## Notion

Variables d'environnement (jamais dans le dépôt) :

| Variable | Rôle |
|---|---|
| `NOTION_TOKEN` | Jeton de ton intégration Notion. Vide = mode démo |
| `NOTION_PAGE_ID` | Page Notion qui accueille les bases (la même pour Repax, Agendix et Argenx) |
| `APP_PASSWORD` | Mot de passe de l'appli (conseillé dès qu'elle est sur Internet) |
| `WIDGET_TOKEN` | Jeton du widget iPhone (32 caractères au moins). Vide = widget désactivé |
| `PORT` | Port du serveur (3011 par défaut) |

Au premier lancement avec Notion, l'appli **crée elle-même les 6 bases** (et ajoute les colonnes qui manquent après une mise à jour) dans la page (si elles n'y sont pas déjà), et ajoute les recettes d'exemple :

| Base | Colonnes |
|---|---|
| Produits & prix | Nom · Catégorie · Prix · Unité · Source du prix · Date du prix · Synonymes |
| Recettes | Nom · Lien Marmiton · Portions · Ingrédients · Temps (min) · Coût estimé · Coût par portion · Date de récupération · Type de repas · Difficulté · Étapes · Favori · Image |
| Planning des repas | Repas · Date · Moment · Recette (→ Recettes) · Coût estimé · Portions cuisinées · Restes · Consommé · Gardé · Mangé ailleurs |
| Liste de courses | Article · Paquets · Quantité · Besoin · Unité · Produit (→ Produits) · Coût estimé · Acheté · Pour le · Source du prix |
| Garde-manger | Produit · Quantité · Unité · Acheté le · À finir avant · Origine |
| Budget & dépenses | Libellé · Type (Budget / Dépense) · Montant · Date · Période · Magasin · Personnes · Repas · Restes le midi · Je n'aime pas · Pas de four |

Les bases « Présence » (Agendix) et « Courses payées » (Argenx) sont lues, jamais créées ni modifiées par Repax.

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
| `widget.js` | Route du widget iPhone : jeton, débit, calcul du prochain repas et des courses urgentes |
| `demo-recettes.json` | Recettes d'exemple |
| `public/` | Interface (HTML, CSS, JS), manifest PWA, service worker, icônes |
| `test.js` | Tests (`npm test`) |
