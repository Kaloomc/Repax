// Catalogue des ingrédients courants, lecture des lignes de recette Marmiton
// ("200 g de farine") et calcul de leur coût.
//
// Chaque ingrédient du catalogue :
//   unite      : unité de prix (kg, L ou pièce)
//   estimation : prix par défaut (€ par unité) quand Open Prices n'a rien
//   paquet     : quantité vendue d'un coup (500 g de pâtes = 0.5) ; en vrac, le poids d'une pièce
//   garde      : nombre de jours où il se garde après l'achat
//   ouvert     : nombre de jours où il se garde une fois entamé (conserves, crème…)
//   mots       : mots qui le reconnaissent dans une recette (sans accents)
//   piece      : poids d'une pièce en kg (1 oignon ≈ 0,1 kg)
//   tag / cat  : où le chercher dans Open Prices (catégorie de produit frais / catégorie de produit emballé)
//   placard    : sel, poivre, épices… comptés à 0 € (on les a déjà)

const SOURCES = {
  superU: 'Open Prices Super U',
  autre: 'Open Prices autre magasin',
  estimation: 'Estimation par catégorie',
  manuel: 'Saisi à la main',
};

const FL = 'Fruits & légumes', VP = 'Viandes & poissons', FR = 'Frais', EP = 'Épicerie';

const CATALOGUE = [
  // Fruits & légumes
  { nom: 'Carottes', rayon: FL, unite: 'kg', estimation: 1.5, paquet: 1, garde: 21, piece: 0.1, mots: ['carotte'], tag: 'en:carrots' },
  { nom: 'Oignons', rayon: FL, unite: 'kg', estimation: 2, paquet: 1, garde: 30, piece: 0.1, mots: ['oignon'], tag: 'en:onions' },
  { nom: 'Échalotes', rayon: FL, unite: 'kg', estimation: 5, paquet: 0.25, garde: 30, piece: 0.03, mots: ['echalote'], tag: 'en:shallots' },
  { nom: 'Ail', rayon: FL, unite: 'kg', estimation: 10, paquet: 0.05, garde: 30, piece: 0.005, mots: ['ail', 'gousse d ail'], tag: 'en:garlic' },
  { nom: 'Pommes de terre', rayon: FL, unite: 'kg', estimation: 1.5, paquet: 2.5, garde: 30, piece: 0.15, mots: ['pomme de terre', 'pommes de terre', 'patate'], tag: 'en:potatoes' },
  { nom: 'Tomates', rayon: FL, unite: 'kg', estimation: 3, paquet: 0.12, garde: 6, piece: 0.12, mots: ['tomate'], tag: 'en:tomatoes' },
  { nom: 'Courgettes', rayon: FL, unite: 'kg', estimation: 2.5, paquet: 0.25, garde: 7, piece: 0.25, mots: ['courgette'], tag: 'en:zucchini' },
  { nom: 'Aubergines', rayon: FL, unite: 'kg', estimation: 3, paquet: 0.3, garde: 7, piece: 0.3, mots: ['aubergine'], tag: 'en:aubergines' },
  { nom: 'Poivrons', rayon: FL, unite: 'kg', estimation: 4, paquet: 0.2, garde: 7, piece: 0.2, mots: ['poivron'], tag: 'en:peppers' },
  { nom: 'Champignons', rayon: FL, unite: 'kg', estimation: 5, paquet: 0.25, garde: 4, piece: 0.02, mots: ['champignon'], tag: 'en:mushrooms' },
  { nom: 'Poireaux', rayon: FL, unite: 'kg', estimation: 2.5, paquet: 0.25, garde: 7, piece: 0.25, mots: ['poireau', 'blanc de poireau'], tag: 'en:leeks' },
  { nom: 'Brocolis', rayon: FL, unite: 'kg', estimation: 3.5, paquet: 0.4, garde: 5, piece: 0.4, mots: ['brocoli'], tag: 'en:broccoli' },
  { nom: 'Chou-fleur', rayon: FL, unite: 'kg', estimation: 3, paquet: 0.8, garde: 7, piece: 0.8, mots: ['chou fleur'], tag: 'en:cauliflowers' },
  { nom: 'Épinards', rayon: FL, unite: 'kg', estimation: 5, paquet: 0.5, garde: 3, piece: 0.03, mots: ['epinard'], tag: 'en:spinachs' },
  { nom: 'Haricots verts', rayon: FL, unite: 'kg', estimation: 5, paquet: 0.5, garde: 4, mots: ['haricots verts', 'haricot vert'], tag: 'en:green-beans' },
  { nom: 'Salade', rayon: FL, unite: 'pièce', estimation: 1.2, paquet: 1, garde: 4, piece: 0.3, mots: ['salade', 'laitue', 'mache', 'roquette'], tag: 'en:lettuces' },
  { nom: 'Concombre', rayon: FL, unite: 'pièce', estimation: 1, paquet: 1, garde: 6, piece: 0.35, mots: ['concombre'], tag: 'en:cucumbers' },
  { nom: 'Citrons', rayon: FL, unite: 'kg', estimation: 4, paquet: 0.12, garde: 21, piece: 0.12, mots: ['citron', 'jus de citron'], tag: 'en:lemons' },
  { nom: 'Pommes', rayon: FL, unite: 'kg', estimation: 2.5, paquet: 0.18, garde: 21, piece: 0.18, mots: ['pomme'], tag: 'en:apples' },
  { nom: 'Bananes', rayon: FL, unite: 'kg', estimation: 2, paquet: 0.18, garde: 5, piece: 0.18, mots: ['banane'], tag: 'en:bananas' },
  { nom: 'Avocats', rayon: FL, unite: 'pièce', estimation: 1, paquet: 1, garde: 4, piece: 0.2, mots: ['avocat'] },

  // Viandes & poissons
  { nom: 'Filets de poulet', rayon: VP, unite: 'kg', estimation: 11, paquet: 0.4, garde: 3, piece: 0.15, mots: ['blanc de poulet', 'blancs de poulet', 'filet de poulet', 'filets de poulet', 'escalope de poulet', 'escalopes de poulet', 'aiguillettes de poulet', 'emince de poulet'], cat: 'en:chicken-breasts', noms: ['poulet'] },
  { nom: 'Cuisses de poulet', rayon: VP, unite: 'kg', estimation: 6, paquet: 1, garde: 3, piece: 0.25, mots: ['cuisse de poulet', 'cuisses de poulet', 'pilon'], cat: 'en:chicken-thighs', noms: ['cuisse', 'pilon'] },
  { nom: 'Poulet entier', rayon: VP, unite: 'kg', estimation: 7, paquet: 1.5, garde: 3, piece: 1.5, mots: ['poulet'], cat: 'en:chickens', noms: ['poulet'] },
  { nom: 'Bœuf haché', rayon: VP, unite: 'kg', estimation: 12, paquet: 0.5, garde: 2, piece: 0.125, mots: ['boeuf hache', 'viande hachee', 'steak hache', 'steaks haches', 'hachis'], cat: 'en:ground-meats', noms: ['hach'] },
  { nom: 'Bœuf', rayon: VP, unite: 'kg', estimation: 16, paquet: 0.5, garde: 3, piece: 0.15, mots: ['boeuf', 'bourguignon', 'paleron', 'macreuse'], cat: 'en:beef', noms: ['boeuf'] },
  { nom: 'Porc', rayon: VP, unite: 'kg', estimation: 9, paquet: 0.5, garde: 3, piece: 0.15, mots: ['porc', 'echine', 'filet mignon', 'cote de porc'] },
  { nom: 'Saucisses', rayon: VP, unite: 'kg', estimation: 9, paquet: 0.4, garde: 4, piece: 0.1, mots: ['saucisse', 'merguez', 'chipolata', 'knack'], cat: 'en:sausages', noms: ['saucisse', 'merguez', 'chipolata', 'knack'] },
  { nom: 'Saumon', rayon: VP, unite: 'kg', estimation: 25, paquet: 0.25, garde: 2, piece: 0.125, mots: ['saumon', 'pave de saumon'], cat: 'en:salmons', noms: ['saumon'] },
  { nom: 'Poisson blanc', rayon: VP, unite: 'kg', estimation: 14, paquet: 0.4, garde: 2, piece: 0.125, mots: ['cabillaud', 'colin', 'merlu', 'lieu', 'poisson blanc', 'filet de poisson', 'filets de poisson'] },
  { nom: 'Crevettes', rayon: VP, unite: 'kg', estimation: 18, paquet: 0.2, garde: 2, mots: ['crevette'] },

  // Frais
  { nom: 'Œufs', rayon: FR, unite: 'pièce', estimation: 0.3, paquet: 6, garde: 21, piece: 0.06, mots: ['oeuf', 'jaune d oeuf', 'blanc d oeuf'] },
  { nom: 'Lait', rayon: FR, unite: 'L', estimation: 1.1, paquet: 1, garde: 60, ouvert: 5, mots: ['lait'], cat: 'en:milks', noms: ['lait'] },
  { nom: 'Beurre', rayon: FR, unite: 'kg', estimation: 9, paquet: 0.25, garde: 30, piece: 0.01, mots: ['beurre'], cat: 'en:butters', noms: ['beurre'] },
  { nom: 'Crème fraîche', rayon: FR, unite: 'L', estimation: 4, paquet: 0.2, garde: 14, ouvert: 4, mots: ['creme fraiche', 'creme liquide', 'creme epaisse', 'creme'], cat: 'en:creams', noms: ['creme'] },
  { nom: 'Emmental râpé', rayon: FR, unite: 'kg', estimation: 9, paquet: 0.2, garde: 21, ouvert: 7, mots: ['emmental', 'gruyere', 'fromage rape', 'comte'], cat: 'en:emmentaler', noms: ['emmental'] },
  { nom: 'Mozzarella', rayon: FR, unite: 'kg', estimation: 8, paquet: 0.125, garde: 10, ouvert: 2, piece: 0.125, mots: ['mozzarella'], cat: 'en:mozzarella', noms: ['mozzarella'] },
  { nom: 'Parmesan', rayon: FR, unite: 'kg', estimation: 20, paquet: 0.1, garde: 30, mots: ['parmesan', 'parmigiano'], cat: 'en:parmigiano-reggiano', noms: ['parm'] },
  { nom: 'Fromage', rayon: FR, unite: 'kg', estimation: 12, paquet: 0.2, garde: 14, ouvert: 7, piece: 0.03, mots: ['fromage', 'chevre', 'feta', 'raclette', 'reblochon', 'cheddar'] },
  { nom: 'Jambon', rayon: FR, unite: 'kg', estimation: 13, paquet: 0.18, garde: 7, ouvert: 3, piece: 0.045, mots: ['jambon'], cat: 'en:white-hams', noms: ['jambon'] },
  { nom: 'Lardons', rayon: FR, unite: 'kg', estimation: 9, paquet: 0.2, garde: 14, ouvert: 3, mots: ['lardon'], cat: 'en:lardons', noms: ['lardon'] },
  { nom: 'Chorizo', rayon: FR, unite: 'kg', estimation: 14, paquet: 0.2, garde: 30, ouvert: 14, mots: ['chorizo'], cat: 'en:chorizos', noms: ['chorizo'] },
  { nom: 'Pâte à tarte', rayon: FR, unite: 'pièce', estimation: 1.3, paquet: 1, garde: 10, piece: 0.23, mots: ['pate brisee', 'pate feuilletee', 'pate a tarte', 'pate sablee', 'pate a pizza', 'rouleau de pate'] },
  { nom: 'Yaourts', rayon: FR, unite: 'pièce', estimation: 0.25, paquet: 4, garde: 14, piece: 0.125, mots: ['yaourt', 'yogourt'] },

  // Épicerie
  { nom: 'Pâtes', rayon: EP, unite: 'kg', estimation: 1.6, paquet: 0.5, garde: 365, mots: ['pates', 'spaghetti', 'tagliatelle', 'coquillette', 'penne', 'fusilli', 'macaroni', 'linguine', 'farfalle', 'nouilles', 'lasagne'], cat: 'en:pastas', noms: ['pates', 'spaghetti', 'tagliatelle', 'coquillette', 'penne', 'fusilli', 'macaroni', 'farfalle'] },
  { nom: 'Riz', rayon: EP, unite: 'kg', estimation: 2.2, paquet: 1, garde: 365, mots: ['riz'], cat: 'en:rices', noms: ['riz'] },
  { nom: 'Semoule', rayon: EP, unite: 'kg', estimation: 2, paquet: 0.5, garde: 365, mots: ['semoule', 'couscous'] },
  { nom: 'Farine', rayon: EP, unite: 'kg', estimation: 1, paquet: 1, garde: 365, mots: ['farine'], cat: 'en:wheat-flours', noms: ['farine'] },
  { nom: 'Sucre', rayon: EP, unite: 'kg', estimation: 1.3, paquet: 1, garde: 365, mots: ['sucre', 'cassonade'], cat: 'en:sugars', noms: ['sucre'] },
  { nom: "Huile d'olive", rayon: EP, unite: 'L', estimation: 9, paquet: 0.5, garde: 365, mots: ['huile d olive'], cat: 'en:olive-oils', noms: ['olive'] },
  { nom: 'Huile', rayon: EP, unite: 'L', estimation: 2.5, paquet: 1, garde: 365, mots: ['huile'], cat: 'en:sunflower-oils', noms: ['huile'] },
  { nom: 'Lentilles', rayon: EP, unite: 'kg', estimation: 2.8, paquet: 0.5, garde: 365, mots: ['lentille'], cat: 'en:lentils', noms: ['lentille'] },
  { nom: 'Pois chiches', rayon: EP, unite: 'kg', estimation: 2.5, paquet: 0.4, garde: 365, ouvert: 3, mots: ['pois chiche'], cat: 'en:chickpeas', noms: ['pois chiche'] },
  { nom: 'Haricots rouges', rayon: EP, unite: 'kg', estimation: 2.5, paquet: 0.4, garde: 365, ouvert: 3, mots: ['haricots rouges', 'haricot rouge', 'red kidney'] },
  { nom: 'Petits pois', rayon: EP, unite: 'kg', estimation: 3, paquet: 0.28, garde: 365, ouvert: 3, mots: ['petits pois', 'petit pois'] },
  { nom: 'Maïs', rayon: EP, unite: 'kg', estimation: 3.5, paquet: 0.3, garde: 365, ouvert: 3, mots: ['mais'], cat: 'en:sweet-corn', noms: ['mais'] },
  { nom: 'Tomates en conserve', rayon: EP, unite: 'kg', estimation: 2, paquet: 0.4, garde: 365, ouvert: 3, mots: ['tomates pelees', 'tomates concassees', 'tomate concassee', 'pulpe de tomate', 'coulis de tomate', 'tomates en conserve', 'boite de tomate'], cat: 'en:canned-tomatoes', noms: ['tomate'] },
  { nom: 'Sauce tomate', rayon: EP, unite: 'kg', estimation: 3, paquet: 0.5, garde: 365, ouvert: 5, mots: ['sauce tomate', 'passata'], cat: 'en:tomato-sauces', noms: ['tomate'] },
  { nom: 'Concentré de tomate', rayon: EP, unite: 'kg', estimation: 5, paquet: 0.14, garde: 365, ouvert: 7, mots: ['concentre de tomate', 'double concentre'], cat: 'en:tomato-pastes', noms: ['concentre'] },
  { nom: 'Thon en boîte', rayon: EP, unite: 'kg', estimation: 12, paquet: 0.14, garde: 365, ouvert: 2, mots: ['thon'], cat: 'en:canned-tunas', noms: ['thon'] },
  { nom: 'Lait de coco', rayon: EP, unite: 'L', estimation: 4, paquet: 0.4, garde: 365, ouvert: 3, mots: ['lait de coco', 'creme de coco'], cat: 'en:coconut-milks', noms: ['coco'] },
  { nom: 'Pesto', rayon: EP, unite: 'kg', estimation: 14, paquet: 0.19, garde: 365, ouvert: 7, mots: ['pesto'] },
  { nom: 'Tortillas', rayon: EP, unite: 'pièce', estimation: 0.25, paquet: 8, garde: 30, ouvert: 7, piece: 0.04, mots: ['tortilla', 'wrap', 'galette de ble'] },
  { nom: 'Pain de mie', rayon: EP, unite: 'kg', estimation: 3.5, paquet: 0.5, garde: 10, piece: 0.025, mots: ['pain de mie'], cat: 'en:sliced-breads', noms: ['mie'] },
  { nom: 'Pain', rayon: EP, unite: 'pièce', estimation: 1, paquet: 1, garde: 2, piece: 0.25, mots: ['pain', 'baguette', 'chapelure'] },
  { nom: 'Bouillon', rayon: EP, unite: 'pièce', estimation: 0.15, paquet: 10, garde: 365, piece: 0.01, mots: ['bouillon', 'cube'] },
  { nom: 'Vin', rayon: EP, unite: 'L', estimation: 5, paquet: 0.75, garde: 365, ouvert: 5, mots: ['vin blanc', 'vin rouge', 'vin'] },

  // Placard : déjà à la maison, compté 0 €
  {
    nom: 'Épices & condiments', rayon: 'Placard', unite: 'pièce', estimation: 0, placard: true,
    mots: ['sel', 'poivre', 'curry', 'cumin', 'paprika', 'epice', 'muscade', 'piment', 'cannelle', 'herbes de provence',
      'thym', 'laurier', 'bouquet garni', 'bouquets garnis', 'persil', 'basilic', 'origan', 'ciboulette', 'coriandre', 'menthe',
      'vinaigre', 'moutarde', 'sauce soja', 'levure', 'eau', 'curcuma', 'gingembre', 'ras el hanout', 'fleur de sel', 'romarin',
      'estragon', 'miel', 'ketchup', 'mayonnaise', 'cornichon', 'sauce'],
  },
];

const PRODUITS = new Map(CATALOGUE.map((e) => [e.nom, e]));

const norm = (s) =>
  String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.,/]+/g, ' ').trim();

// Unités de recette → [type, quantité en kg (ou L) ou en nombre de pièces]
const UNITES = [
  [/^(kg|kilos?|kilogrammes?)\b/, 'masse', 1],
  [/^(g|gr|grammes?)\b/, 'masse', 0.001],
  [/^(l|litres?)\b/, 'masse', 1],
  [/^dl\b/, 'masse', 0.1],
  [/^cl\b/, 'masse', 0.01],
  [/^ml\b/, 'masse', 0.001],
  [/^((cuilleres?|cuil|c) a (soupe|s)|cs|cas)\b/, 'masse', 0.015],
  [/^((cuilleres?|cuil|c) a (cafe|c)|cc|cac)\b/, 'masse', 0.005],
  [/^pincees?\b/, 'masse', 0.001],
  [/^verres?\b/, 'masse', 0.2],
  [/^tasses?\b/, 'masse', 0.25],
  [/^sachets?\b/, 'masse', 0.01],
  [/^poignees?\b/, 'masse', 0.03],
  [/^noix(?= de beurre)/, 'masse', 0.01],
  [/^(boites?|conserves?|briques?)\b/, 'masse', 'boite'],
  [/^(tranches?|gousses?|bottes?|brins?|feuilles?|morceaux?|pots?|paquets?)\b/, 'compte', 1],
];

function reconnaitre(nom) {
  const texte = ' ' + nom;
  let meilleur = null, longueur = 0;
  for (const e of CATALOGUE) {
    for (const mot of e.mots) {
      if (mot.length > longueur && texte.includes(' ' + mot)) {
        meilleur = e;
        longueur = mot.length;
      }
    }
  }
  return meilleur;
}

// "200 g de farine" → { entree: Farine, qte: 0.2 } (qte dans l'unité de prix de l'ingrédient)
function lireLigne(ligne) {
  let reste = norm(ligne);
  let qte = null;
  const m = reste.match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?\s*(.*)$/);
  if (m) {
    qte = parseFloat(m[1].replace(',', '.')) / (m[2] ? Number(m[2]) : 1);
    reste = m[3];
  }
  reste = reste.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  let type = 'compte', facteur = 1;
  for (const [re, t, f] of UNITES) {
    const u = reste.match(re);
    if (u && qte != null) {
      type = t;
      facteur = f;
      reste = reste.slice(u[0].length).trim();
      break;
    }
  }
  reste = reste.replace(/^(de |d |des |du )/, '');
  const entree = reconnaitre(reste);
  if (!entree) return { entree: null, nom: reste || norm(ligne), detail: reste, qte: qte ?? 1 };
  if (facteur === 'boite') facteur = entree.paquet ?? 0.4;
  if (qte == null) {
    // Pas de quantité ("huile d'olive") : une petite dose ou une pièce.
    return { entree, nom: entree.nom, detail: reste, qte: entree.unite === 'pièce' ? 1 : 0.01 };
  }
  const q = qte * facteur;
  const piece = entree.piece ?? 0.1;
  const enUnite = entree.unite === 'pièce'
    ? (type === 'compte' ? q : q / piece)
    : (type === 'masse' ? q : q * piece);
  return { entree, nom: entree.nom, detail: reste, qte: enUnite };
}

// Prix connus : produits enregistrés (Open Prices ou saisis), sinon estimation du catalogue.
function tarifs(produits) {
  const t = new Map();
  for (const e of CATALOGUE) t.set(e.nom, { prix: e.estimation, source: SOURCES.estimation, date: null });
  // Un prix saisi à la main passe avant tout.
  const tries = [...produits].sort((a, b) => (a.source === SOURCES.manuel) - (b.source === SOURCES.manuel));
  for (const p of tries) if (t.has(p.nom) && Number.isFinite(p.prix)) t.set(p.nom, { prix: p.prix, source: p.source, date: p.datePrix, id: p.id });
  return t;
}

const PRIX_INCONNU = 0.5; // € par ligne d'ingrédient non reconnue

// Coût au prorata (ce qu'on mange vraiment), pour comparer les recettes entre elles.
function analyserRecette(recette, t) {
  const lignes = String(recette.ingredients || '').split('\n').map((l) => l.trim()).filter(Boolean).map((brut) => {
    const l = lireLigne(brut);
    if (!l.entree) return { brut, nom: l.nom, detail: l.detail, qte: l.qte, unite: 'fois', cout: PRIX_INCONNU, source: SOURCES.estimation, rayon: 'Autres', inconnu: true };
    const tarif = t.get(l.entree.nom);
    return {
      brut, nom: l.nom, detail: l.detail, qte: l.qte, unite: l.entree.unite, rayon: l.entree.rayon, placard: !!l.entree.placard,
      cout: l.entree.placard ? 0 : l.qte * tarif.prix, source: tarif.source, produit: tarif.id,
    };
  });
  const portions = recette.portions || 4;
  const cout = lignes.reduce((s, l) => s + l.cout, 0);
  return { lignes, cout, coutPortion: cout / portions, estime: lignes.some((l) => !l.placard && l.source === SOURCES.estimation) };
}

module.exports = { CATALOGUE, PRODUITS, SOURCES, PRIX_INCONNU, norm, lireLigne, tarifs, analyserRecette };
