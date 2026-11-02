// Catalogue des ingrédients courants, lecture des lignes de recette Marmiton
// ("200 g de farine") et calcul de leur coût.
//
// Chaque ingrédient du catalogue :
//   unite      : unité de prix (kg, L ou pièce)
//   estimation : prix par défaut (€ par unité) quand Open Prices n'a rien
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

const CATALOGUE = [
  // Fruits & légumes
  { nom: 'Carottes', rayon: 'Fruits & légumes', unite: 'kg', estimation: 1.5, piece: 0.1, mots: ['carotte'], tag: 'en:carrots' },
  { nom: 'Oignons', rayon: 'Fruits & légumes', unite: 'kg', estimation: 2, piece: 0.1, mots: ['oignon'], tag: 'en:onions' },
  { nom: 'Échalotes', rayon: 'Fruits & légumes', unite: 'kg', estimation: 5, piece: 0.03, mots: ['echalote'], tag: 'en:shallots' },
  { nom: 'Ail', rayon: 'Fruits & légumes', unite: 'kg', estimation: 10, piece: 0.005, mots: ['ail', 'gousse d ail'], tag: 'en:garlic' },
  { nom: 'Pommes de terre', rayon: 'Fruits & légumes', unite: 'kg', estimation: 1.5, piece: 0.15, mots: ['pomme de terre', 'pommes de terre', 'patate'], tag: 'en:potatoes' },
  { nom: 'Tomates', rayon: 'Fruits & légumes', unite: 'kg', estimation: 3, piece: 0.12, mots: ['tomate'], tag: 'en:tomatoes' },
  { nom: 'Courgettes', rayon: 'Fruits & légumes', unite: 'kg', estimation: 2.5, piece: 0.25, mots: ['courgette'], tag: 'en:zucchini' },
  { nom: 'Aubergines', rayon: 'Fruits & légumes', unite: 'kg', estimation: 3, piece: 0.3, mots: ['aubergine'], tag: 'en:aubergines' },
  { nom: 'Poivrons', rayon: 'Fruits & légumes', unite: 'kg', estimation: 4, piece: 0.2, mots: ['poivron'], tag: 'en:peppers' },
  { nom: 'Champignons', rayon: 'Fruits & légumes', unite: 'kg', estimation: 5, piece: 0.02, mots: ['champignon'], tag: 'en:mushrooms' },
  { nom: 'Poireaux', rayon: 'Fruits & légumes', unite: 'kg', estimation: 2.5, piece: 0.25, mots: ['poireau', 'blanc de poireau'], tag: 'en:leeks' },
  { nom: 'Brocolis', rayon: 'Fruits & légumes', unite: 'kg', estimation: 3.5, piece: 0.4, mots: ['brocoli'], tag: 'en:broccoli' },
  { nom: 'Chou-fleur', rayon: 'Fruits & légumes', unite: 'kg', estimation: 3, piece: 0.8, mots: ['chou fleur'], tag: 'en:cauliflowers' },
  { nom: 'Épinards', rayon: 'Fruits & légumes', unite: 'kg', estimation: 5, piece: 0.03, mots: ['epinard'], tag: 'en:spinachs' },
  { nom: 'Haricots verts', rayon: 'Fruits & légumes', unite: 'kg', estimation: 5, mots: ['haricots verts', 'haricot vert'], tag: 'en:green-beans' },
  { nom: 'Salade', rayon: 'Fruits & légumes', unite: 'pièce', estimation: 1.2, piece: 0.3, mots: ['salade', 'laitue', 'mache', 'roquette'], tag: 'en:lettuces' },
  { nom: 'Concombre', rayon: 'Fruits & légumes', unite: 'pièce', estimation: 1, piece: 0.35, mots: ['concombre'], tag: 'en:cucumbers' },
  { nom: 'Citrons', rayon: 'Fruits & légumes', unite: 'kg', estimation: 4, piece: 0.12, mots: ['citron', 'jus de citron'], tag: 'en:lemons' },
  { nom: 'Pommes', rayon: 'Fruits & légumes', unite: 'kg', estimation: 2.5, piece: 0.18, mots: ['pomme'], tag: 'en:apples' },
  { nom: 'Bananes', rayon: 'Fruits & légumes', unite: 'kg', estimation: 2, piece: 0.18, mots: ['banane'], tag: 'en:bananas' },
  { nom: 'Avocats', rayon: 'Fruits & légumes', unite: 'pièce', estimation: 1, piece: 0.2, mots: ['avocat'] },

  // Viandes & poissons
  { nom: 'Filets de poulet', rayon: 'Viandes & poissons', unite: 'kg', estimation: 11, piece: 0.15, mots: ['blanc de poulet', 'blancs de poulet', 'filet de poulet', 'filets de poulet', 'escalope de poulet', 'escalopes de poulet', 'aiguillettes de poulet', 'emince de poulet'], cat: 'en:chicken-breasts', noms: ['poulet'] },
  { nom: 'Cuisses de poulet', rayon: 'Viandes & poissons', unite: 'kg', estimation: 6, piece: 0.25, mots: ['cuisse de poulet', 'cuisses de poulet', 'pilon'], cat: 'en:chicken-thighs', noms: ['cuisse', 'pilon'] },
  { nom: 'Poulet entier', rayon: 'Viandes & poissons', unite: 'kg', estimation: 7, piece: 1.5, mots: ['poulet'], cat: 'en:chickens', noms: ['poulet'] },
  { nom: 'Bœuf haché', rayon: 'Viandes & poissons', unite: 'kg', estimation: 12, piece: 0.125, mots: ['boeuf hache', 'viande hachee', 'steak hache', 'steaks haches', 'hachis'], cat: 'en:ground-meats', noms: ['hach'] },
  { nom: 'Bœuf', rayon: 'Viandes & poissons', unite: 'kg', estimation: 16, piece: 0.15, mots: ['boeuf', 'bourguignon', 'paleron', 'macreuse'], cat: 'en:beef', noms: ['boeuf'] },
  { nom: 'Porc', rayon: 'Viandes & poissons', unite: 'kg', estimation: 9, piece: 0.15, mots: ['porc', 'echine', 'filet mignon', 'cote de porc'] },
  { nom: 'Saucisses', rayon: 'Viandes & poissons', unite: 'kg', estimation: 9, piece: 0.1, mots: ['saucisse', 'merguez', 'chipolata', 'knack'], cat: 'en:sausages', noms: ['saucisse', 'merguez', 'chipolata', 'knack'] },
  { nom: 'Saumon', rayon: 'Viandes & poissons', unite: 'kg', estimation: 25, piece: 0.125, mots: ['saumon', 'pave de saumon'], cat: 'en:salmons', noms: ['saumon'] },
  { nom: 'Poisson blanc', rayon: 'Viandes & poissons', unite: 'kg', estimation: 14, piece: 0.125, mots: ['cabillaud', 'colin', 'merlu', 'lieu', 'poisson blanc', 'filet de poisson', 'filets de poisson'] },
  { nom: 'Crevettes', rayon: 'Viandes & poissons', unite: 'kg', estimation: 18, mots: ['crevette'] },

  // Frais
  { nom: 'Œufs', rayon: 'Frais', unite: 'pièce', estimation: 0.3, piece: 0.06, mots: ['oeuf', 'jaune d oeuf', 'blanc d oeuf'] },
  { nom: 'Lait', rayon: 'Frais', unite: 'L', estimation: 1.1, mots: ['lait'], cat: 'en:milks', noms: ['lait'] },
  { nom: 'Beurre', rayon: 'Frais', unite: 'kg', estimation: 9, piece: 0.01, mots: ['beurre'], cat: 'en:butters', noms: ['beurre'] },
  { nom: 'Crème fraîche', rayon: 'Frais', unite: 'L', estimation: 4, mots: ['creme fraiche', 'creme liquide', 'creme epaisse', 'creme'], cat: 'en:creams', noms: ['creme'] },
  { nom: 'Emmental râpé', rayon: 'Frais', unite: 'kg', estimation: 9, mots: ['emmental', 'gruyere', 'fromage rape', 'comte'], cat: 'en:emmentaler', noms: ['emmental'] },
  { nom: 'Mozzarella', rayon: 'Frais', unite: 'kg', estimation: 8, piece: 0.125, mots: ['mozzarella'], cat: 'en:mozzarella', noms: ['mozzarella'] },
  { nom: 'Parmesan', rayon: 'Frais', unite: 'kg', estimation: 20, mots: ['parmesan', 'parmigiano'], cat: 'en:parmigiano-reggiano', noms: ['parm'] },
  { nom: 'Fromage', rayon: 'Frais', unite: 'kg', estimation: 12, piece: 0.03, mots: ['fromage', 'chevre', 'feta', 'raclette', 'reblochon', 'cheddar'] },
  { nom: 'Jambon', rayon: 'Frais', unite: 'kg', estimation: 13, piece: 0.045, mots: ['jambon'], cat: 'en:white-hams', noms: ['jambon'] },
  { nom: 'Lardons', rayon: 'Frais', unite: 'kg', estimation: 9, mots: ['lardon'], cat: 'en:lardons', noms: ['lardon'] },
  { nom: 'Chorizo', rayon: 'Frais', unite: 'kg', estimation: 14, mots: ['chorizo'], cat: 'en:chorizos', noms: ['chorizo'] },
  { nom: 'Pâte à tarte', rayon: 'Frais', unite: 'pièce', estimation: 1.3, piece: 0.23, mots: ['pate brisee', 'pate feuilletee', 'pate a tarte', 'pate sablee', 'pate a pizza', 'rouleau de pate'] },
  { nom: 'Yaourts', rayon: 'Frais', unite: 'pièce', estimation: 0.25, piece: 0.125, mots: ['yaourt', 'yogourt'] },

  // Épicerie
  { nom: 'Pâtes', rayon: 'Épicerie', unite: 'kg', estimation: 1.6, mots: ['pates', 'spaghetti', 'tagliatelle', 'coquillette', 'penne', 'fusilli', 'macaroni', 'linguine', 'farfalle', 'nouilles', 'lasagne'], cat: 'en:pastas', noms: ['pates', 'spaghetti', 'tagliatelle', 'coquillette', 'penne', 'fusilli', 'macaroni', 'farfalle'] },
  { nom: 'Riz', rayon: 'Épicerie', unite: 'kg', estimation: 2.2, mots: ['riz'], cat: 'en:rices', noms: ['riz'] },
  { nom: 'Farine', rayon: 'Épicerie', unite: 'kg', estimation: 1, mots: ['farine'], cat: 'en:wheat-flours', noms: ['farine'] },
  { nom: 'Sucre', rayon: 'Épicerie', unite: 'kg', estimation: 1.3, mots: ['sucre', 'cassonade'], cat: 'en:sugars', noms: ['sucre'] },
  { nom: "Huile d'olive", rayon: 'Épicerie', unite: 'L', estimation: 9, mots: ['huile d olive'], cat: 'en:olive-oils', noms: ['olive'] },
  { nom: 'Huile', rayon: 'Épicerie', unite: 'L', estimation: 2.5, mots: ['huile'], cat: 'en:sunflower-oils', noms: ['huile'] },
  { nom: 'Lentilles', rayon: 'Épicerie', unite: 'kg', estimation: 2.8, mots: ['lentille'], cat: 'en:lentils', noms: ['lentille'] },
  { nom: 'Pois chiches', rayon: 'Épicerie', unite: 'kg', estimation: 2.5, boite: 0.4, mots: ['pois chiche'], cat: 'en:chickpeas', noms: ['pois chiche'] },
  { nom: 'Haricots rouges', rayon: 'Épicerie', unite: 'kg', estimation: 2.5, boite: 0.4, mots: ['haricots rouges', 'haricot rouge', 'red kidney'] },
  { nom: 'Petits pois', rayon: 'Épicerie', unite: 'kg', estimation: 3, boite: 0.28, mots: ['petits pois', 'petit pois'] },
  { nom: 'Maïs', rayon: 'Épicerie', unite: 'kg', estimation: 3.5, boite: 0.3, mots: ['mais'], cat: 'en:sweet-corn', noms: ['mais'] },
  { nom: 'Tomates en conserve', rayon: 'Épicerie', unite: 'kg', estimation: 2, boite: 0.4, mots: ['tomates pelees', 'tomates concassees', 'tomate concassee', 'pulpe de tomate', 'coulis de tomate', 'tomates en conserve', 'boite de tomate'], cat: 'en:canned-tomatoes', noms: ['tomate'] },
  { nom: 'Sauce tomate', rayon: 'Épicerie', unite: 'kg', estimation: 3, mots: ['sauce tomate', 'passata'], cat: 'en:tomato-sauces', noms: ['tomate'] },
  { nom: 'Concentré de tomate', rayon: 'Épicerie', unite: 'kg', estimation: 5, mots: ['concentre de tomate', 'double concentre'], cat: 'en:tomato-pastes', noms: ['concentre'] },
  { nom: 'Thon en boîte', rayon: 'Épicerie', unite: 'kg', estimation: 12, boite: 0.14, mots: ['thon'], cat: 'en:canned-tunas', noms: ['thon'] },
  { nom: 'Lait de coco', rayon: 'Épicerie', unite: 'L', estimation: 4, boite: 0.4, mots: ['lait de coco', 'creme de coco'], cat: 'en:coconut-milks', noms: ['coco'] },
  { nom: 'Pain de mie', rayon: 'Épicerie', unite: 'kg', estimation: 3.5, piece: 0.025, mots: ['pain de mie'], cat: 'en:sliced-breads', noms: ['mie'] },
  { nom: 'Pain', rayon: 'Épicerie', unite: 'pièce', estimation: 1, piece: 0.25, mots: ['pain', 'baguette', 'chapelure'] },
  { nom: 'Bouillon', rayon: 'Épicerie', unite: 'pièce', estimation: 0.15, piece: 0.01, mots: ['bouillon', 'cube'] },
  { nom: 'Vin', rayon: 'Épicerie', unite: 'L', estimation: 5, mots: ['vin blanc', 'vin rouge', 'vin'] },

  // Placard : déjà à la maison, compté 0 €
  {
    nom: 'Épices & condiments', rayon: 'Placard', unite: 'pièce', estimation: 0, placard: true,
    mots: ['sel', 'poivre', 'curry', 'cumin', 'paprika', 'epice', 'muscade', 'piment', 'cannelle', 'herbes de provence',
      'thym', 'laurier', 'bouquet garni', 'bouquets garnis', 'persil', 'basilic', 'origan', 'ciboulette', 'coriandre',
      'vinaigre', 'moutarde', 'sauce soja', 'levure', 'eau', 'curcuma', 'gingembre', 'ras el hanout', 'fleur de sel', 'romarin', 'estragon', 'miel', 'ketchup', 'mayonnaise'],
  },
];

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
  if (!entree) return { entree: null, nom: reste || norm(ligne), qte: qte ?? 1 };
  if (facteur === 'boite') facteur = entree.boite ?? 0.4;
  if (qte == null) {
    // Pas de quantité ("huile d'olive") : une petite dose ou une pièce.
    return { entree, nom: entree.nom, qte: entree.unite === 'pièce' ? 1 : 0.01 };
  }
  const q = qte * facteur;
  const piece = entree.piece ?? 0.1;
  const enUnite = entree.unite === 'pièce'
    ? (type === 'compte' ? q : q / piece)
    : (type === 'masse' ? q : q * piece);
  return { entree, nom: entree.nom, qte: enUnite };
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

function analyserRecette(recette, t) {
  const lignes = String(recette.ingredients || '').split('\n').map((l) => l.trim()).filter(Boolean).map((brut) => {
    const l = lireLigne(brut);
    if (!l.entree) return { brut, nom: l.nom, qte: l.qte, unite: 'fois', cout: PRIX_INCONNU, source: SOURCES.estimation, rayon: 'Autres', inconnu: true };
    const tarif = t.get(l.entree.nom);
    return {
      brut, nom: l.nom, qte: l.qte, unite: l.entree.unite, rayon: l.entree.rayon, placard: !!l.entree.placard,
      cout: l.entree.placard ? 0 : l.qte * tarif.prix, source: tarif.source, produit: tarif.id,
    };
  });
  const portions = recette.portions || 4;
  const cout = lignes.reduce((s, l) => s + l.cout, 0);
  return { lignes, cout, coutPortion: cout / portions, estime: lignes.some((l) => !l.placard && l.source === SOURCES.estimation) };
}

module.exports = { CATALOGUE, SOURCES, norm, lireLigne, tarifs, analyserRecette };
