// Choix des repas des 7 prochains jours, par règles (pas d'IA) :
// achat par paquets entiers, placard virtuel pour le surplus, midi simple / soir cuisiné.
const { norm } = require('./ingredients');

const JOUR = 24 * 3600 * 1000;
const EPS = 1e-9;

const ajouterJours = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * JOUR).toISOString().slice(0, 10);
const joursEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / JOUR);
const minDate = (a, b) => (a < b ? a : b);

// Lundi de la semaine qui contient cette date.
const lundi = (iso) => ajouterJours(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));

// Date et heure à Paris : { date: 'AAAA-MM-JJ', heure: 15.5 }
function maintenantParis(d = new Date()) {
  const [date, h] = d.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).split(' ');
  const [hh, mm] = h.split(':').map(Number);
  return { date, heure: hh + mm / 60 };
}
const aujourdhui = () => maintenantParis().date;

// Un repas est passé à 14 h (midi) ou 21 h (soir).
const FIN = { midi: 14, soir: 21 };
const estPasse = (date, moment, m) => date < m.date || (date === m.date && m.heure >= FIN[moment]);

// Les 7 prochains jours à partir du prochain repas.
function creneauxAVenir(repas, m) {
  const moments = ['midi', 'soir'].filter((x) => repas.includes(x));
  const out = [];
  for (let j = 0; out.length < 7 * moments.length; j++) {
    const date = ajouterJours(m.date, j);
    for (const moment of moments) if (!estPasse(date, moment, m) && out.length < 7 * moments.length) out.push({ date, moment });
  }
  return out;
}

const budgetSemaine = (reglages) => (reglages.periode === 'mois' ? (reglages.budget * 12) / 52 : reglages.budget);

// --- Type de plat : midi simple ou plat du soir --------------------------------
const TYPES = ['Midi simple', 'Plat du soir', 'Les deux'];
const MOTS_MIDI = ['salade', 'sandwich', 'wrap', 'croque', 'tartine', 'panini', 'bowl', 'omelette', 'quesadilla', 'toast',
  'bagel', 'taboule', 'pan bagnat', 'club', 'hot dog', 'pates au pesto', 'pates au thon', 'poke', 'jambon beurre', 'pita'];

// Devine le type à partir du nom, de la difficulté Marmiton et du nombre d'ingrédients (hors épices).
function classer(nom, nbIngredients, difficulte = '', typeMarmiton = '') {
  const n = ' ' + norm(nom);
  if (MOTS_MIDI.some((m) => n.includes(' ' + m))) return 'Midi simple';
  const d = norm(difficulteLisible(difficulte));
  if (norm(typeMarmiton).startsWith('entree') && nbIngredients <= 8) return 'Midi simple';
  if (d.startsWith('tres facile') && nbIngredients <= 5) return 'Les deux';
  return 'Plat du soir';
}

// --- Ce que je n'aime pas / ce que je n'ai pas -----------------------------------
const EXCLUSIONS_DEFAUT = 'omelette, soupe, velouté, fruits de mer';
// Un mot qui désigne toute une famille d'ingrédients.
const FAMILLES = {
  'fruits de mer': ['fruits de mer', 'crevette', 'gambas', 'moule', 'calamar', 'encornet', 'saint jacques', 'coquille saint',
    'crabe', 'homard', 'langouste', 'huitre', 'poulpe', 'seiche', 'bulot', 'palourde', 'coque', 'surimi'],
  soupe: ['soupe', 'potage'],
};
// Plats qui demandent un four (dans le nom ou les étapes).
const FOUR = /(^| )(four|fours|enfourn\w*|prechauff\w*|thermostat|gratin\w*|tarte|tartes|quiche|lasagnes?|clafoutis|cake|pizza|roti|feuillete|parmentier|moussaka|crumble|souffle|muffins?|brownie)( |$)/;

// Pourquoi une recette n'est pas proposée (liste vide = elle l'est).
// Les mots exclus sont cherchés dans le nom et les ingrédients (sans les unités : « cuillère à soupe » ne compte pas).
function raisonsExclusion(recette, lignes, { exclusions = '', sansFour = false } = {}) {
  const raisons = [];
  const nom = ' ' + norm(recette.nom) + ' ';
  const ingredients = lignes.map((l) => ' ' + norm(l.detail || '') + ' ').join('|');
  for (const mot of exclusions.split(',').map(norm).filter(Boolean)) {
    if ((FAMILLES[mot] || [mot]).some((m) => nom.includes(' ' + m) || ingredients.includes(' ' + m))) raisons.push(mot);
  }
  if (sansFour && FOUR.test(norm(recette.nom + ' ' + (recette.etapes || '')))) raisons.push('four');
  return raisons;
}

// Difficulté Marmiton (« tresfacile », « Niveau moyen »…) → texte lisible.
function difficulteLisible(d) {
  const k = norm(d || '').replace(/niveau|[\s-]/g, '');
  return { tresfacile: 'très facile', facile: 'facile', moyen: 'moyenne', moyenne: 'moyenne', difficile: 'difficile' }[k] || d || '';
}

// Difficulté devinée quand la recette n'en a pas : nombre d'ingrédients (hors épices) et d'étapes.
function difficulteDe(nbIngredients, etapes = '') {
  const nbEtapes = String(etapes).split('\n').filter((l) => l.trim()).length;
  if (nbIngredients <= 4 && nbEtapes <= 4) return 'très facile';
  if (nbIngredients <= 8 && nbEtapes <= 8) return 'facile';
  return 'moyenne';
}

// --- Placard --------------------------------------------------------------------
// Prend `qte` d'un produit dans les lots, en finissant d'abord ce qui périme le plus tôt.
// Un lot entamé se garde ensuite moins longtemps (conserve ouverte, crème…). Renvoie ce qui manque
// et la valeur de ce qui a été pris (doublée pour ce qui allait se perdre).
function prendre(lots, produit, qte, date, prix = 0) {
  let reste = qte, valeur = 0;
  const dispo = lots
    .filter((l) => l.nom === produit.nom && l.qte > EPS && l.peremption >= date)
    .sort((a, b) => a.peremption.localeCompare(b.peremption));
  for (const l of dispo) {
    if (reste <= EPS) break;
    const pris = Math.min(l.qte, reste);
    l.qte -= pris;
    reste -= pris;
    valeur += pris * prix * (joursEntre(date, l.peremption) <= 2 ? 2 : 1);
    if (l.qte > EPS && produit.ouvert) l.peremption = minDate(l.peremption, ajouterJours(date, produit.ouvert));
  }
  return { manque: Math.max(0, reste), valeur };
}

// --- Planificateur ----------------------------------------------------------------
// recettes : [{ id, type, besoins: [{ nom, qte (par portion) } | { nom, inconnu, cout (par portion) }] }]
// produits : Map nom → entrée du catalogue + prix (€ par unité)
// stock    : [{ nom, quantite, peremption }] ce qu'il y a déjà au placard
//
// Règles, pour chaque repas dans l'ordre :
//  1. midi : un plat « Midi simple » ; soir : un « Plat du soir » (ou « Les deux ») ;
//  2. coût réel : on pioche d'abord dans le placard, sinon on achète des paquets entiers,
//     et le surplus retourne au placard pour les repas suivants ;
//  3. bonus aux recettes qui finissent ce qui est au placard (doublé si ça va périmer) ;
//  4. budget : on garde de quoi payer les repas restants ;
//  5. variété : une recette au plus 2 fois en 7 jours, jamais deux fois de suite ;
//  6. option restes : le plat du soir est cuisiné en double et mangé le lendemain midi ;
//  7. un peu de hasard pour que deux propositions ne soient pas identiques.
// fixes  : Map 'date moment' → { recette, portions, restes, ailleurs, garde } repas à garder tels quels
// exclus : Map 'date moment' → id de recette à ne pas reprendre à ce repas (🔁 changer)
// ponytail: choix glouton repas par repas, sans retour en arrière ; un vrai solveur si ça ne suffit plus.
function planifier({ recettes, produits, stock = [], creneaux, reglages, fixes = new Map(), exclus = new Map(), hasard = Math.random }) {
  if (!recettes.length || !creneaux.length) return { repas: [], achats: [], total: 0, gaspillage: [] };
  let lots = stock.map((s) => ({ nom: s.nom, qte: s.quantite, peremption: s.peremption }));
  const achats = new Map();
  const budget = budgetSemaine(reglages);
  const utilisations = new Map();
  const besoins = new Map(); // quantité totale utilisée par produit sur les 7 jours
  const derniers = {}; // dernière recette par moment : pas deux soirs (ou deux midis) de suite
  const repas = [];
  let depense = 0, dernier = null;

  // Une recette exclue (four, je n'aime pas) n'est jamais choisie ; elle sert seulement si un repas 📌 gardé l'utilise.
  const proposables = recettes.filter((r) => !r.exclue);
  // Les repas déjà décidés comptent d'avance pour la variété, même s'ils sont plus loin dans la semaine.
  for (const f of fixes.values()) if (f.recette && !f.ailleurs && !f.restes) utilisations.set(f.recette, (utilisations.get(f.recette) || 0) + 1);
  const recetteFixe = (date, moment) => {
    const f = fixes.get(cleCreneau(date, moment));
    return f && !f.ailleurs ? f.recette : null;
  };
  const coutProrata = (r) => r.besoins.reduce((s, b) => s + (b.inconnu ? b.cout : b.qte * produits.get(b.nom).prix), 0);
  const moinsCher = Math.min(...(proposables.length ? proposables : recettes).map(coutProrata)) * reglages.personnes;

  function simuler(r, date, portions) {
    const copie = lots.map((l) => ({ ...l }));
    let cout = 0, valeurStock = 0;
    const nouveaux = [];
    for (const b of r.besoins) {
      if (b.inconnu) {
        cout += b.cout * portions;
        nouveaux.push({ nom: b.nom, inconnu: true, cout: b.cout * portions, pour: date });
        continue;
      }
      const p = produits.get(b.nom);
      const { manque, valeur } = prendre(copie, p, b.qte * portions, date, p.prix);
      valeurStock += valeur;
      if (manque <= EPS) continue;
      const paquets = Math.ceil(manque / p.paquet - EPS);
      const quantite = paquets * p.paquet;
      cout += quantite * p.prix;
      const surplus = quantite - manque;
      // On suppose l'achat fait à temps (ou congelé) : le paquet se garde à partir du jour où il sert.
      if (surplus > EPS) copie.push({ nom: b.nom, qte: surplus, peremption: ajouterJours(date, p.ouvert ? Math.min(p.garde, p.ouvert) : p.garde) });
      nouveaux.push({ nom: b.nom, paquets, quantite, besoin: manque, cout: quantite * p.prix, pour: date });
    }
    return { cout, valeurStock, lots: copie, achats: nouveaux };
  }

  creneaux.forEach((c, i) => {
    // Repas déjà décidé (📌 gardé, mangé ailleurs, ou tous les autres quand on n'en change qu'un) : on le reprend tel quel.
    const fixe = fixes.get(cleCreneau(c.date, c.moment));
    if (fixe?.ailleurs || fixe?.restes) {
      repas.push({ ...c, recette: fixe.recette, restes: !!fixe.restes, ailleurs: !!fixe.ailleurs, garde: !!fixe.garde, portions: 0, cout: 0 });
      return;
    }
    const precedent = repas[repas.length - 1];
    if (!fixe && precedent?.double && c.moment === 'midi' && precedent.date === ajouterJours(c.date, -1) &&
        exclus.get(cleCreneau(c.date, c.moment)) !== precedent.recette) {
      repas.push({ ...c, recette: precedent.recette, restes: true, portions: 0, cout: 0 });
      return;
    }
    const suivant = creneaux[i + 1];
    const double = fixe
      ? fixe.portions > reglages.personnes
      : !!reglages.restes && c.moment === 'soir' && suivant?.moment === 'midi' && suivant.date === ajouterJours(c.date, 1) &&
        !fixes.has(cleCreneau(suivant.date, suivant.moment));
    const portions = fixe ? fixe.portions || reglages.personnes : reglages.personnes * (double ? 2 : 1);

    let choix;
    if (fixe) {
      const r = recettes.find((x) => x.id === fixe.recette);
      choix = { r, s: simuler(r, c.date, portions) };
    } else {
      const types = c.moment === 'midi' ? ['Midi simple', 'Les deux'] : ['Plat du soir', 'Les deux'];
      const exclue = exclus.get(cleCreneau(c.date, c.moment)); // 🔁 changer ce repas : pas la même recette
      let pool = proposables.filter((r) => types.includes(r.type) && r.id !== exclue);
      if (!pool.length) pool = proposables.filter((r) => r.id !== exclue);
      if (!pool.length) pool = proposables.length ? proposables : recettes;
      // Pas la même chose qu'au repas d'avant, qu'au même moment la veille, ni qu'aux repas déjà décidés juste après.
      const voisins = [recetteFixe(suivant?.date, suivant?.moment), recetteFixe(ajouterJours(c.date, 1), c.moment)];
      const recent = (r) => r.id === dernier || r.id === derniers[c.moment] || voisins.includes(r.id);
      let candidates = pool.filter((r) => (utilisations.get(r.id) || 0) < 2 && !recent(r));
      if (!candidates.length) candidates = pool.filter((r) => !recent(r));
      if (!candidates.length) candidates = pool;

      const reserve = moinsCher * (creneaux.length - i - 1);
      const sims = candidates.map((r) => ({ r, s: simuler(r, c.date, portions) }));
      const possibles = sims.filter((x) => depense + x.s.cout <= budget - reserve + EPS);
      choix = possibles.length
        ? possibles
            .map((x) => ({ ...x, score: -x.s.cout + 1.5 * x.s.valeurStock - 4 * (utilisations.get(x.r.id) || 0) + (x.r.favori ? 1 : 0) + hasard() * 1.5 }))
            .sort((a, b) => b.score - a.score)[0]
        : sims.reduce((a, b) => (a.s.cout <= b.s.cout ? a : b)); // budget dépassé : le moins cher
    }

    lots = choix.s.lots.filter((l) => l.qte > EPS);
    for (const a of choix.s.achats) {
      const x = achats.get(a.nom) || { nom: a.nom, inconnu: a.inconnu, paquets: 0, quantite: 0, besoin: 0, cout: 0, pour: a.pour };
      x.paquets += a.paquets || 0;
      x.quantite += a.quantite || 0;
      x.besoin += a.besoin || 0;
      x.cout += a.cout;
      achats.set(a.nom, x);
    }
    for (const b of choix.r.besoins) if (!b.inconnu) besoins.set(b.nom, (besoins.get(b.nom) || 0) + b.qte * portions);
    depense += choix.s.cout;
    if (!fixe) utilisations.set(choix.r.id, (utilisations.get(choix.r.id) || 0) + 1);
    dernier = derniers[c.moment] = choix.r.id;
    repas.push({ ...c, recette: choix.r.id, restes: false, garde: !!fixe?.garde, double, portions, cout: choix.s.cout });
  });

  // Ce qui restera au placard et périmera avant la fin des 7 jours.
  const fin = creneaux[creneaux.length - 1].date;
  const gaspillage = lots
    .filter((l) => l.peremption <= fin)
    .map((l) => ({ nom: l.nom, qte: l.qte, valeur: l.qte * produits.get(l.nom).prix }));

  for (const a of achats.values()) if (!a.inconnu) a.besoin = besoins.get(a.nom);
  return { repas, achats: [...achats.values()], total: depense, gaspillage };
}

// --- Où suis-je à ce repas ? (base Notion « Présence », remplie par Agendix) -------------
// La ligne sans date donne le lieu par défaut (Angoulême s'il n'y en a pas). Une période couvre les repas
// entre ses deux bornes, bornes comprises ; si plusieurs la couvrent, la plus récente (Ordre) l'emporte.
const cleCreneau = (date, moment) => `${date} ${moment === 'soir' ? 2 : 1}`;
function lieuDe(presence, date, moment) {
  const recente = (l) => [...l].sort((a, b) => (b.ordre ?? 0) - (a.ordre ?? 0))[0];
  const k = cleCreneau(date, moment);
  const p = recente(presence.filter((l) => l.du && l.lieu &&
    cleCreneau(l.du, l.duMoment || 'midi') <= k && k <= cleCreneau(l.au || l.du, l.auMoment || 'soir')));
  return p?.lieu ?? recente(presence.filter((l) => !l.du && l.lieu))?.lieu ?? 'Angoulême';
}

// --- Écrire le planning sans abîmer ce qui a changé à la main dans Notion --------------------------
const pareil = (a, b) => Object.keys(b).every((k) => (a[k] ?? null) === b[k]);

// Compare les lignes actuelles et les lignes voulues, repas par repas (cle) : ce qu'il faut ajouter, modifier
// sur place ou retirer. Une ligne identique ne bouge pas ; une ligne qui change est modifiée, jamais recréée.
function preparerEcritures(anciennes, lignes, cle) {
  const libres = new Map(anciennes.map((a) => [cle(a), a]));
  const ops = { ajouts: [], modifs: [], retraits: [] };
  for (const l of lignes) {
    const a = libres.get(cle(l));
    libres.delete(cle(l));
    if (!a) ops.ajouts.push(l);
    else if (!pareil(a, l)) ops.modifs.push([a, l]);
  }
  ops.retraits = [...libres.values()];
  return ops;
}

// Dernier contrôle avec le planning tel que Notion le montre à l'instant d'écrire (`fraiches`) :
//  - on n'ajoute jamais sur un créneau où une ligne existe déjà (même « Consommé », même arrivée entre-temps) ;
//  - on ne touche pas une ligne déplacée, changée de recette, épinglée ou cochée Consommé depuis qu'on l'a lue ;
//  - on ne retire jamais une ligne qui n'est plus celle qu'on avait lue.
function verifierEcritures(ops, fraiches, cle) {
  const parId = new Map(fraiches.map((x) => [x.id, x]));
  const pris = new Set(fraiches.filter((x) => x.date && x.moment).map(cle));
  const intacte = (a) => {
    const f = parId.get(a.id);
    return !!f && cle(f) === cle(a) && (f.recette ?? null) === (a.recette ?? null) && !!f.garde === !!a.garde && !f.consomme;
  };
  return {
    ajouts: ops.ajouts.filter((l) => !pris.has(cle(l))),
    modifs: ops.modifs.filter(([a]) => intacte(a)),
    retraits: ops.retraits.filter((a) => intacte(a) && !a.garde),
  };
}

module.exports = {
  preparerEcritures, verifierEcritures, pareil,
  planifier, prendre, classer, TYPES, creneauxAVenir, estPasse, maintenantParis,
  lundi, ajouterJours, aujourdhui, budgetSemaine, lieuDe, cleCreneau,
  raisonsExclusion, difficulteDe, difficulteLisible, EXCLUSIONS_DEFAUT,
};
