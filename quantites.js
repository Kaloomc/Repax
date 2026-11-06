// Recettes écrites pour N personnes → recettes pour M personnes, avec des quantités qu'on peut vraiment acheter
// et cuisiner : « 2 tomates » pour 4 devient « ½ tomate » pour 1, pas « 60 g de tomates ».
// Tout se fait par règles sur le texte de la recette : l'unité d'origine est gardée (pièce, cuillère, gousse, g…),
// seul le nombre change, arrondi comme on le fait en cuisine. Aucune IA.
//
// Limites connues : la phrase n'est pas comprise, seulement son début (« 3 oignons émincés ») ; les accords
// d'adjectifs sont devinés (on ajoute ou retire un « s ») ; une recette dont les quantités sont données
// en toutes lettres (« une demi-boîte ») n'est pas modifiée.

const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const GLYPHES = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// 1.5 → « 1 ½ », 0.5 → « ½ », 2.25 → « 2 ¼ », 3 → « 3 », 2.4 → « 2,4 »
function nombre(x) {
  const entier = Math.floor(x + 1e-9);
  const reste = Math.round((x - entier) * 100) / 100;
  if (reste < 0.01) return String(entier);
  if (FRACTIONS[reste]) return entier ? `${entier} ${FRACTIONS[reste]}` : FRACTIONS[reste];
  return String(Math.round(x * 10) / 10).replace('.', ',');
}
const auQuart = (x, min = 0.25) => Math.max(min, Math.round(x * 4) / 4);
const auDemi = (x, min = 0.5) => Math.max(min, Math.round(x * 2) / 2);
const entier = (x) => Math.max(1, Math.round(x));
// Arrondi « de cuisine » d'une masse ou d'un volume en g / ml : 5 près en dessous de 100, 10 près jusqu'à 250, etc.
const pasDe = (v) => (v < 100 ? 5 : v < 250 ? 10 : v < 500 ? 25 : 50);
const arrondiMasse = (v) => Math.max(5, Math.round(v / pasDe(v)) * pasDe(v));

// Unités reconnues au début de ce qui suit le nombre. [motif, genre, singulier, pluriel]
// genres : masse (g, kg), volume (ml, cl, dl, l), cuillere, pincee, boite, compte (gousse, tranche… : toujours entier)
const U = (re, genre, s, p = s) => [new RegExp(`^(?:${re})(?![a-zàâçéèêëîïôûùüÿœ])\\.?\\s*`, 'i'), genre, s, p];
const UNITES = [
  U('kg|kilos?|kilogrammes?', 'kg', 'kg'),
  U('g|gr|grammes?', 'g', 'g'),
  U('l|litres?', 'l', 'L'),
  U('dl', 'dl', 'dl'),
  U('cl', 'cl', 'cl'),
  U('ml', 'ml', 'ml'),
  U('c\\.?\\s?[àa]\\.?\\s?s(?:oupe)?\\.?|cuill?[eè]res?\\s+[àa]\\s+soupe|cs|c[àa]s', 'cuillere', 'cuillère à soupe', 'cuillères à soupe'),
  U('c\\.?\\s?[àa]\\.?\\s?c(?:af[eé])?\\.?|cuill?[eè]res?\\s+[àa]\\s+(?:caf[eé]|th[eé])|cc|c[àa]c', 'cuillere', 'cuillère à café', 'cuillères à café'),
  U('pinc[ée]es?', 'pincee', 'pincée', 'pincées'),
  U('verres?', 'cuillere', 'verre', 'verres'),
  U('tasses?', 'cuillere', 'tasse', 'tasses'),
  U('poign[ée]es?', 'cuillere', 'poignée', 'poignées'),
  U('bo[iî]tes?|conserves?', 'boite', 'boîte', 'boîtes'),
  U('gousses?', 'compte', 'gousse', 'gousses'),
  U('tranches?', 'compte', 'tranche', 'tranches'),
  U('sachets?', 'compte', 'sachet', 'sachets'),
  U('feuilles?', 'compte', 'feuille', 'feuilles'),
  U('brins?', 'compte', 'brin', 'brins'),
  U('bottes?', 'compte', 'botte', 'bottes'),
  U('pots?', 'compte', 'pot', 'pots'),
  U('paquets?', 'compte', 'paquet', 'paquets'),
  U('morceaux?', 'compte', 'morceau', 'morceaux'),
  U('barquettes?', 'compte', 'barquette', 'barquettes'),
];

// Ce qui ne se coupe pas en deux : on arrondit à l'unité.
const INDIVISIBLES = ['oeuf', 'yaourt', 'tortilla', 'wrap', 'saucisse', 'merguez', 'chipolata', 'steak', 'escalope', 'filet', 'cuisse',
  'pilon', 'banane', 'cube', 'galette', 'crepe', 'tranche', 'saucisson', 'knack', 'burger', 'pita', 'naan', 'bagel'];
const sansAccent = (s) => s.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');

// --- Singulier / pluriel d'un groupe nominal (« 3 oignons émincés » ⇄ « 1 oignon émincé ») -----------------
const INVARIABLES = new Set(['pois', 'radis', 'riz', 'mais', 'maïs', 'jus', 'frais', 'gros', 'bras', 'noix', 'mélange', 'fois', 'anis', 'sous']);
const PREPOSITIONS = new Set(['de', "d'", 'du', 'des', 'à', 'au', 'aux', 'en', 'pour', 'et', 'ou', 'avec', 'sans', 'sur']);
function inflechir(groupe, pluriel) {
  const mots = groupe.split(' ');
  let tete = true; // on s'arrête à la première préposition : « pommes de terre », « blancs de poulet »
  return mots.map((mot) => {
    if (!tete || PREPOSITIONS.has(mot.toLowerCase()) || /^d['’]/i.test(mot) || /[,;(]/.test(mot)) { tete = false; return mot; }
    if (INVARIABLES.has(mot.toLowerCase()) || mot.length < 3) return mot;
    if (pluriel) return /[sxz]$/i.test(mot) ? mot : mot + 's';
    return /[^s]s$/i.test(mot) && !/(us|is)$/i.test(mot) ? mot.slice(0, -1) : mot;
  }).join(' ');
}

// --- Lecture du début d'une ligne : « 1 1/2 », « 3/4 », « 1,5 », « ½ », « 2 à 3 » ------------------------------
function lireNombre(s) {
  const un = (t) => {
    let m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
    if (m) return [Number(m[1]) + Number(m[2]) / Number(m[3]), m[0].length];
    m = t.match(/^(\d+)\s*\/\s*(\d+)/);
    if (m) return [Number(m[1]) / Number(m[2]), m[0].length];
    m = t.match(/^(\d+)?\s?([½¼¾⅓⅔])/);
    if (m) return [Number(m[1] || 0) + GLYPHES[m[2]], m[0].length];
    m = t.match(/^\d+(?:[.,]\d+)?/);
    if (m) return [parseFloat(m[0].replace(',', '.')), m[0].length];
    return null;
  };
  const a = un(s);
  if (!a) return null;
  const apres = s.slice(a[1]);
  const lien = apres.match(/^\s*(?:à|a|-|–)\s*(?=[\d½¼¾])/);
  const b = lien && un(apres.slice(lien[0].length));
  return b
    ? { valeur: a[0], max: b[0], reste: apres.slice(lien[0].length + b[1]) }
    : { valeur: a[0], max: null, reste: apres };
}

const liaison = (nom) => (/^[aeiouyhàâéèêîôûœ]/i.test(nom) ? "d'" : 'de ');

const virgule = (x) => String(x).replace('.', ',');
const phraseMasse = (g) => (g >= 1000 ? { n: virgule(Math.round(g / 250) / 4), u: 'kg' } : { n: String(arrondiMasse(g)), u: 'g' });
const phraseVolume = (ml) => {
  if (ml >= 1000) return { n: virgule(Math.round(ml / 250) / 4), u: 'L' };
  const r = arrondiMasse(ml);
  return r >= 10 && r % 10 === 0 ? { n: String(r / 10), u: 'cl' } : { n: String(r), u: 'ml' };
};
// « 200 g », ou « 200 à 300 g » pour une fourchette.
const joindre = (a, b) => (!b ? `${a.n} ${a.u}` : a.u === b.u ? `${a.n} à ${b.n} ${a.u}` : `${a.n} ${a.u} à ${b.n} ${b.u}`);

// Une ligne d'ingrédient réécrite pour `facteur` fois plus (ou moins) de monde. Sans quantité au début : inchangée.
function echelle(ligne, facteur) {
  const brut = String(ligne).trim();
  if (!brut || Math.abs(facteur - 1) < 1e-9) return brut;
  const n = lireNombre(brut);
  if (!n || !(n.valeur > 0)) return brut;
  const reste = n.reste.replace(/^\s+/, '');
  const unite = UNITES.find(([re]) => re.test(reste));
  const apres = unite ? reste.replace(unite[0], '') : reste;
  const nom = apres.replace(/^(?:de la |de l['’]|de |d['’]|des |du )/i, '').trim();
  const v = n.valeur * facteur;
  const v2 = n.max ? n.max * facteur : null;
  const grand = v2 ?? v;

  if (unite) {
    const [, genre, singulier, plur] = unite;
    const lier = nom ? ` ${liaison(nom)}${nom}` : '';
    const avec = (quantite, u) => `${quantite} ${u}${lier}`;
    if (genre === 'g' || genre === 'kg') {
      const k = genre === 'kg' ? 1000 : 1;
      return `${joindre(phraseMasse(v * k), v2 && phraseMasse(v2 * k))}${lier}`;
    }
    if (['ml', 'cl', 'dl', 'l'].includes(genre)) {
      const k = { ml: 1, cl: 10, dl: 100, l: 1000 }[genre];
      return `${joindre(phraseVolume(v * k), v2 && phraseVolume(v2 * k))}${lier}`;
    }
    if (genre === 'cuillere') {
      const a = (x) => (x >= 5 ? Math.round(x) : x >= 2 ? auDemi(x) : auQuart(x));
      const q = v2 ? `${nombre(a(v))} à ${nombre(a(v2))}` : nombre(a(v));
      return avec(q, a(grand) > 1 ? plur : singulier);
    }
    if (genre === 'boite') {
      const a = auQuart(grand);
      return avec(v2 ? `${nombre(auQuart(v))} à ${nombre(a)}` : nombre(a), a > 1 ? plur : singulier);
    }
    // pincées, gousses, tranches, sachets… : jamais de fraction
    return avec(v2 ? `${nombre(entier(v))} à ${nombre(entier(v2))}` : nombre(entier(v)), entier(grand) > 1 ? plur : singulier);
  }

  // Pas d'unité : des pièces (« 2 tomates », « 6 œufs »).
  if (!nom) return brut;
  const indivisible = INDIVISIBLES.some((m) => ` ${sansAccent(nom)}`.includes(` ${m}`));
  const arrondi = (x) => (x >= 5 || indivisible ? entier(x) : auDemi(x));
  const q = v2 ? `${nombre(arrondi(v))} à ${nombre(arrondi(v2))}` : nombre(arrondi(v));
  return `${q} ${inflechir(nom, arrondi(grand) > 1)}`;
}

// Les étapes : seuls les nombres suivis d'une unité (« 200 g », « 2 cuillères ») ou du nom d'un ingrédient
// de la recette (« 3 oignons ») changent ; les durées, températures et numéros restent tels quels.
function echelleEtape(texte, facteur, lignes = [], personnes = null) {
  let out = String(texte || '');
  if (Math.abs(facteur - 1) < 1e-9) return out;
  const noms = new Set();
  for (const l of lignes) {
    const n = lireNombre(String(l).trim());
    let reste = (n ? n.reste : String(l)).replace(/^\s+/, '');
    const u = UNITES.find(([re]) => re.test(reste));
    if (u) reste = reste.replace(u[0], '');
    const mot = sansAccent(reste.replace(/^(?:de la |de l['’]|de |d['’]|des |du )/i, '').split(' ')[0] || '').replace(/s$/, '');
    if (mot.length > 2) noms.add(mot);
  }
  if (personnes) out = out.replace(/\b(\d+)\s+(personnes?|convives|portions?)/gi, (_, __, mot) => `${personnes} ${personnes > 1 ? mot.replace(/s?$/, 's') : mot.replace(/s$/, '')}`);
  const NB = '(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?|[½¼¾])';
  const motif = new RegExp(`(^|[^\\d/.,])${NB}\\s*([a-zàâçéèêëîïôûùüÿœ°]+(?:\\s+[àa]\\s+(?:soupe|caf[eé]))?)`, 'gi');
  return out.replace(motif, (tout, avant, nb, suite) => {
    const mot = sansAccent(suite.split(' ')[0]).replace(/s$/, '');
    const estUnite = UNITES.some(([re]) => re.test(`${suite} `)) && !/^(l)$/i.test(suite);
    if (!estUnite && !noms.has(mot)) return tout;
    const nouveau = echelle(`${nb} ${suite}`, facteur);
    return avant + nouveau;
  }).replace(/\b([Ll])es (?=(?:½|¼|¾|1) )/g, ''); // « les 2 tomates » → « ½ tomate » : plus d'article pluriel
}

// Liste de courses : ce qu'on achète, compté comme au magasin. « 3 tomates (≈ 360 g) », « 6 œufs » plutôt que « 360 g ».
// `produit` : entrée du catalogue ; `quantite` : ce qu'on achète, dans l'unité du produit. null : garder l'affichage habituel.
function libelleAchat(produit, quantite) {
  if (!produit?.piece || !(quantite > 0)) return null;
  const nom = produit.nom.toLowerCase();
  if (produit.unite === 'pièce') return `${nombre(Math.round(quantite * 10) / 10)} ${inflechir(nom, quantite > 1)}`;
  if (produit.unite === 'kg' && produit.paquet === produit.piece) {
    const n = Math.max(1, Math.round(quantite / produit.piece));
    const g = Math.round(quantite * 1000);
    return `${n} ${inflechir(nom, n > 1)} (≈ ${g >= 1000 ? `${virgule(Math.round(g / 50) / 20)} kg` : `${Math.round(g / 10) * 10} g`})`;
  }
  return null;
}

module.exports = { echelle, echelleEtape, inflechir, nombre, libelleAchat };
