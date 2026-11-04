const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const marmiton = require('./marmiton');
const prix = require('./prix');
const { CATALOGUE, PRODUITS, SOURCES, tarifs, analyserRecette, definirSynonymes, lireLigne, norm } = require('./ingredients');
const {
  planifier, prendre, classer, TYPES, creneauxAVenir, estPasse, maintenantParis,
  lundi, ajouterJours, aujourdhui, budgetSemaine, lieuDe, cleCreneau,
  raisonsExclusion, difficulteDe, difficulteLisible, EXCLUSIONS_DEFAUT, preparerEcritures, verifierEcritures,
} = require('./planning');

const app = express();
app.set('trust proxy', 1); // derrière le proxy inversé du NAS
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Mot de passe (facultatif mais conseillé une fois en ligne) ---------------
// Si APP_PASSWORD est défini, l'API demande de se connecter une fois ; un cookie garde la session un an.
const MOT_DE_PASSE = process.env.APP_PASSWORD;
const jeton = MOT_DE_PASSE && crypto.createHmac('sha256', MOT_DE_PASSE).update('gestion-repas').digest('hex');
const egal = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

app.post('/api/connexion', async (req, res) => {
  if (!MOT_DE_PASSE) return res.json({ ok: true });
  const essai = String(req.body?.motDePasse ?? '');
  if (!egal(crypto.createHmac('sha256', essai).update('gestion-repas').digest('hex'), jeton)) {
    await new Promise((r) => setTimeout(r, 1000)); // freine les essais en série
    return res.status(401).json({ erreur: 'Mot de passe incorrect' });
  }
  res.setHeader('Set-Cookie', `repas=${jeton}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (!MOT_DE_PASSE || req.path === '/etat') return next();
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)repas=([a-f0-9]+)/)?.[1] || '';
  if (egal(cookie, jeton)) return next();
  res.status(401).json({ erreur: 'Connexion nécessaire' });
});

// --- Outils -----------------------------------------------------------------
const REGLAGES_DEFAUT = {
  budget: 60, periode: 'semaine', personnes: 1, repas: ['midi', 'soir'], restes: false,
  exclusions: EXCLUSIONS_DEFAUT, sansFour: true, // seul avec une poêle et une casserole
};
const rayonDe = (nom) => PRODUITS.get(nom)?.rayon || 'Autres';
const arrondi = (x) => Math.round(x * 100) / 100;
const arrondi3 = (x) => Math.round(x * 1000) / 1000;

class ErreurUtilisateur extends Error {}
const verifier = (ok, message) => {
  if (!ok) throw new ErreurUtilisateur(message);
};

// Les opérations qui touchent au placard passent une par une.
let verrou = Promise.resolve();
const enSerie = (fn) => {
  const p = verrou.then(fn);
  verrou = p.catch(() => {});
  return p;
};

async function reglages() {
  const r = (await store.list('depenses')).find((d) => d.type === 'Budget');
  if (!r) return { ...REGLAGES_DEFAUT };
  return {
    id: r.id, budget: r.montant ?? 60, periode: r.periode || 'semaine', personnes: r.personnes || 1,
    repas: r.repas?.length ? r.repas : ['midi', 'soir'], restes: !!r.restes,
    exclusions: r.exclusions || '', sansFour: !!r.sansFour,
  };
}

async function contexte() {
  const [recettes, produits] = await Promise.all([store.list('recettes'), store.list('produits')]);
  definirSynonymes(produits);
  const t = tarifs(produits);
  const analyses = new Map(recettes.map((r) => [r.id, { portions: r.portions || 4, ...analyserRecette(r, t) }]));
  return { recettes, produits, t, analyses };
}

// Ingrédients qui rendent une recette non végétarienne.
const VIANDE = new Set([...CATALOGUE.filter((e) => e.rayon === 'Viandes & poissons').map((e) => e.nom), 'Jambon', 'Lardons', 'Chorizo', 'Thon en boîte']);
const nbIngredients = (a) => a.lignes.filter((l) => !l.placard).length;
const typeDe = (r, a) => r.type || classer(r.nom, nbIngredients(a), r.difficulte || '');
// Recettes jamais proposées (four, plats que je n'aime pas) : id → raisons.
const exclusionsDe = (recettes, analyses, regl) => new Map(recettes
  .map((r) => [r.id, raisonsExclusion(r, analyses.get(r.id).lignes, regl)])
  .filter(([, raisons]) => raisons.length));

// --- Liens avec les autres applis : tout passe par la page Notion commune ---------------
// Où suis-je, repas par repas ? Lu dans la base « Présence » d'Agendix.
// → { lieu(c) : 'Angoulême' | 'Parents' | 'Ailleurs', erreur }. Base absente : toujours à Angoulême.
async function presence() {
  try {
    const lignes = await store.list('presence');
    return { lieu: (c) => lieuDe(lignes, c.date, c.moment), erreur: null };
  } catch (err) {
    console.error('Présence (Agendix) :', err.message);
    return { lieu: () => 'Angoulême', erreur: 'Base Notion « Présence » illisible : je prévois tous les repas.' };
  }
}

// Vérifie qu'une ligne appartient bien à la base avant de la modifier.
async function trouver(col, id) {
  const ligne = (await store.list(col)).find((x) => x.id === id);
  verifier(ligne, 'Élément introuvable');
  return ligne;
}

// Les repas passés retirent leurs ingrédients du placard (une seule fois chacun).
async function consommerPasses() {
  const m = maintenantParis();
  const aFaire = (await store.list('planning'))
    .filter((p) => !p.consomme && estPasse(p.date, p.moment, m))
    .sort((a, b) => (a.date + a.moment).localeCompare(b.date + b.moment));
  if (!aFaire.length) return;
  const [{ analyses }, regl, stock] = await Promise.all([contexte(), reglages(), store.list('stock')]);
  const lots = stock.map((s) => ({ ...s, qte: s.quantite }));
  for (const p of aFaire) {
    const a = analyses.get(p.recette);
    const portions = p.portions ?? (p.restes ? 0 : regl.personnes);
    if (a && portions > 0 && !p.ailleurs) { // mangé ailleurs : rien n'a été cuisiné
      for (const l of a.lignes) {
        const e = PRODUITS.get(l.nom);
        if (e && !e.placard && !l.inconnu) prendre(lots, e, (l.qte * portions) / a.portions, p.date);
      }
    }
    await store.update('planning', p.id, { consomme: true });
  }
  for (const l of lots) {
    const avant = stock.find((s) => s.id === l.id);
    if (l.qte <= 1e-6) await store.remove('stock', l.id);
    else if (Math.abs(l.qte - avant.quantite) > 1e-9 || l.peremption !== avant.peremption) {
      await store.update('stock', l.id, { quantite: arrondi3(l.qte), peremption: l.peremption });
    }
  }
}

// --- État et réglages --------------------------------------------------------
app.get('/api/etat', (req, res) => {
  res.json({ mode: store.mode, motDePasse: !!MOT_DE_PASSE, auto: etatAuto });
});

// Refresh à la demande : relit dans Notion les bases que l'écran affiche, sans attendre l'expiration du cache
// (10 min pour les bases de Repax, 2 min pour Présence et Courses payées). Utile juste après une modif dans Agendix,
// Argenx ou Notion. Les lignes de chaque base ne sont remplacées que si leur lecture réussit.
const A_RAFRAICHIR = ['presence', 'coursesPayees', 'planning', 'courses', 'stock', 'depenses'];
app.post('/api/notion/rafraichir', async (req, res) => {
  const erreurs = await enSerie(() => store.rafraichir(A_RAFRAICHIR));
  const echecs = Object.entries(erreurs).filter(([, e]) => e).map(([col, message]) => ({ base: store.SCHEMAS[col].titre, message }));
  res.json({ mode: store.mode, ok: !echecs.length, echecs });
});

app.put('/api/reglages', async (req, res) => {
  const { budget, periode, personnes, repas, restes = false, exclusions = '', sansFour = false } = req.body ?? {};
  verifier(
    Number.isFinite(budget) && budget >= 0 && budget <= 10000 &&
    ['semaine', 'mois'].includes(periode) &&
    Number.isInteger(personnes) && personnes >= 1 && personnes <= 20 &&
    Array.isArray(repas) && repas.length > 0 && repas.every((r) => ['midi', 'soir'].includes(r)) &&
    typeof restes === 'boolean' && typeof sansFour === 'boolean' &&
    typeof exclusions === 'string' && exclusions.length <= 300,
    'Réglages invalides'
  );
  const ligne = {
    libelle: 'Réglages', type: 'Budget', montant: budget, periode, personnes, repas: [...new Set(repas)], restes,
    exclusions: exclusions.trim(), sansFour, date: aujourdhui(),
  };
  const actuel = await reglages();
  if (actuel.id) await store.update('depenses', actuel.id, ligne);
  else await store.add('depenses', ligne);
  declencher();
  res.json(await reglages());
});

// --- Recettes ----------------------------------------------------------------
const resumeRecette = (r, a, raisons = []) => ({
  id: r.id, nom: r.nom, url: r.url, portions: a.portions, temps: r.temps,
  difficulte: difficulteLisible(r.difficulte) || difficulteDe(nbIngredients(a), r.etapes), etapes: r.etapes || '',
  type: typeDe(r, a), nbIngredients: nbIngredients(a), exclue: raisons, favori: !!r.favori, image: r.image || null,
  vege: !a.lignes.some((l) => VIANDE.has(l.nom)),
  cout: arrondi(a.cout), coutPortion: arrondi(a.coutPortion), estime: a.estime,
  lignes: a.lignes.map((l) => ({
    brut: l.brut, nom: l.nom, qte: l.qte, unite: l.unite, cout: arrondi(l.cout), source: l.source,
    inconnu: !!l.inconnu, placard: !!l.placard,
  })),
});

app.get('/api/recettes', async (req, res) => {
  const [{ recettes, analyses }, regl, stock] = await Promise.all([contexte(), reglages(), store.list('stock')]);
  const exclues = exclusionsDe(recettes, analyses, regl);
  const auPlacard = new Set(stock.filter((s) => s.quantite > 0 && s.peremption >= aujourdhui()).map((s) => s.nom));
  res.json(recettes.map((r) => {
    const a = analyses.get(r.id);
    const utiles = a.lignes.filter((l) => !l.placard && !l.inconnu);
    // Part des ingrédients déjà au placard (filtre « Avec mon stock »).
    const enStock = utiles.length ? utiles.filter((l) => auPlacard.has(l.nom)).length / utiles.length : 0;
    return { ...resumeRecette(r, a, exclues.get(r.id)), enStock };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
});

// Fiche d'une recette (ingrédients et étapes), ouverte depuis un repas du planning.
app.get('/api/recettes/:id', async (req, res) => {
  const { recettes, analyses } = await contexte();
  const r = recettes.find((x) => x.id === req.params.id);
  verifier(r, 'Recette introuvable (supprimée ?)');
  res.json(resumeRecette(r, analyses.get(r.id)));
});

app.get('/api/marmiton', async (req, res) => {
  const q = String(req.query.q || '').trim();
  verifier(q.length >= 2 && q.length <= 60, 'Tape au moins 2 lettres');
  const [resultats, recettes] = await Promise.all([marmiton.rechercher(q), store.list('recettes')]);
  const connues = new Set(recettes.map((r) => r.url));
  res.json(resultats.map((r) => ({ ...r, deja: connues.has(r.url) })));
});

app.post('/api/recettes', async (req, res) => {
  const url = String(req.body?.url || '').trim().split(/[?#]/)[0];
  verifier(marmiton.URL_RECETTE.test(url), 'Ce lien ne ressemble pas à une recette Marmiton.');
  const { recettes, t } = await contexte();
  // Déjà enregistrée : on ne redemande pas la page à Marmiton.
  const existante = recettes.find((r) => r.url === url);
  if (existante) return res.json({ id: existante.id, nom: existante.nom, deja: true });
  const r = await marmiton.recuperer(url);
  const a = analyserRecette(r, t);
  const type = classer(r.nom, nbIngredients(a), r.difficulte || '', r.typeMarmiton || '');
  const ligne = await store.add('recettes', { ...r, difficulte: difficulteLisible(r.difficulte) || null, type, cout: arrondi(a.cout), coutPortion: arrondi(a.coutPortion), dateRecup: aujourdhui() });
  declencher();
  res.json({ id: ligne.id, nom: ligne.nom, type });
});

app.patch('/api/recettes/:id', async (req, res) => {
  const patch = {};
  if (req.body?.type !== undefined) patch.type = req.body.type;
  if (req.body?.favori !== undefined) patch.favori = req.body.favori;
  verifier(Object.keys(patch).length, 'Rien à changer');
  verifier(patch.type === undefined || TYPES.includes(patch.type), 'Type de repas inconnu');
  verifier(patch.favori === undefined || typeof patch.favori === 'boolean', 'Favori invalide');
  await trouver('recettes', req.params.id);
  await store.update('recettes', req.params.id, patch);
  declencher();
  res.json({ ok: true });
});

app.delete('/api/recettes/:id', async (req, res) => {
  await trouver('recettes', req.params.id);
  await store.remove('recettes', req.params.id);
  declencher();
  res.json({ ok: true });
});

// --- Prix --------------------------------------------------------------------
app.get('/api/prix', async (req, res) => {
  const t = tarifs(await store.list('produits'));
  const liste = CATALOGUE.filter((e) => !e.placard).map((e) => {
    const p = t.get(e.nom);
    return { nom: e.nom, rayon: e.rayon, unite: e.unite, paquet: e.paquet, prix: p.prix, source: p.source, date: p.date, openPrices: !!(e.tag || e.cat) };
  });
  res.json({ liste, etat: prix.etat });
});

app.put('/api/prix/:nom', async (req, res) => {
  const e = PRODUITS.get(req.params.nom);
  verifier(e && !e.placard, 'Produit inconnu');
  const valeur = req.body?.prix;
  const manuels = (await store.list('produits')).filter((p) => p.nom === e.nom && p.source === SOURCES.manuel);
  if (valeur === null) {
    for (const p of manuels) await store.remove('produits', p.id);
    return res.json({ ok: true });
  }
  verifier(Number.isFinite(valeur) && valeur > 0 && valeur < 1000, 'Prix invalide');
  const ligne = { nom: e.nom, categorie: e.rayon, unite: e.unite, prix: arrondi(valeur), source: SOURCES.manuel, datePrix: aujourdhui() };
  if (manuels[0]) await store.update('produits', manuels[0].id, ligne);
  else await store.add('produits', ligne);
  res.json({ ok: true });
});

app.post('/api/prix/actualiser', (req, res) => {
  prix.actualiser(store); // tâche de fond
  res.json(prix.etat);
});

// --- Les 7 prochains jours : planning, courses, placard ------------------------
async function vue() {
  const m = maintenantParis();
  const [planning, courses, stock, regl, { recettes, analyses }] = await Promise.all([
    store.list('planning'), store.list('courses'), store.list('stock'), reglages(), contexte(),
  ]);
  const parId = new Map(recettes.map((r) => [r.id, r]));
  // Les repas d'aujourd'hui restent affichés toute la journée, même une fois passés.
  const repas = planning
    .filter((p) => p.date && p.date >= m.date && p.date <= ajouterJours(m.date, 8))
    .sort((a, b) => (a.date + a.moment).localeCompare(b.date + b.moment))
    .map((p) => {
      const r = parId.get(p.recette);
      return {
        ...p, url: r?.url || null, type: r ? typeDe(r, analyses.get(r.id)) : null, supprimee: !!p.recette && !r,
        temps: r?.temps ?? null, image: r?.image || null, passe: estPasse(p.date, p.moment, m),
      };
    });
  const liste = courses
    .map((c) => ({ ...c, rayon: c.unite === 'placard' ? 'Placard' : rayonDe(c.article) }))
    .sort((a, b) => a.rayon.localeCompare(b.rayon, 'fr') || a.article.localeCompare(b.article, 'fr'));
  const creneaux = creneauxAVenir(regl.repas, m);
  const { lieu, erreur } = await presence();
  return {
    aujourdhui: m.date,
    annulable: !!annulation,
    debut: creneaux[0].date,
    fin: creneaux[creneaux.length - 1].date,
    absences: creneaux.map((c) => ({ ...c, lieu: lieu(c) })).filter((c) => c.lieu !== 'Angoulême'),
    agendix: erreur,
    auto: etatAuto,
    budget: arrondi(budgetSemaine(regl)),
    restes: regl.restes,
    total: arrondi(liste.reduce((s, c) => s + (c.cout || 0), 0)),
    resteAAcheter: arrondi(liste.filter((c) => !c.achete).reduce((s, c) => s + (c.cout || 0), 0)),
    repas,
    courses: liste,
    stock: stock
      .map((s) => ({ ...s, perime: s.peremption < m.date }))
      .sort((a, b) => (a.peremption || '').localeCompare(b.peremption || '')),
    produits: CATALOGUE.filter((e) => !e.placard).map((e) => ({ nom: e.nom, unite: e.unite })),
  };
}

app.get('/api/semaine', async (req, res) => {
  await enSerie(consommerPasses);
  res.json(await vue());
});

// Toutes les colonnes, pour qu'une ligne réutilisée ne garde rien de son ancien contenu.
const complet = (col, obj) => Object.fromEntries(Object.keys(store.SCHEMAS[col].champs).map((k) => [k, obj[k] ?? null]));

// Bases que Repax réécrit : relues dans Notion juste avant de décider, pour ne pas travailler sur un cache périmé
// (modifs faites à la main, par Claude ou par une autre appli depuis la dernière lecture). Si Notion est illisible,
// on n'écrit rien. Pas de relecture plus d'une fois toutes les 5 secondes.
const BASES_REECRITES = ['planning', 'courses', 'stock'];
let derniereRelecture = 0;
async function relire(cols = BASES_REECRITES) {
  if (cols === BASES_REECRITES && Date.now() - derniereRelecture < 5000) return;
  const erreurs = await store.rafraichir(cols);
  const ko = Object.entries(erreurs).filter(([, e]) => e).map(([c]) => store.SCHEMAS[c].titre);
  if (ko.length) throw new Error(`Notion illisible (${ko.join(', ')}) : je n'écris rien pour ne pas écraser tes modifications.`);
  if (cols === BASES_REECRITES) derniereRelecture = Date.now();
}
const relirePlanning = async () => {
  await relire(['planning']);
  return store.list('planning');
};

// Écrit `lignes` à la place de `anciennes` en touchant le moins de lignes Notion possible :
// une ligne identique ne bouge pas, une ligne qui change est modifiée sur place (jamais supprimée puis recréée).
// `relireFrais` (planning) : liste fraîche de Notion, pour un dernier contrôle juste avant d'écrire.
async function remplacerLignes(col, anciennes, lignes, cle, relireFrais) {
  let ops = preparerEcritures(anciennes, lignes, cle);
  if (relireFrais && (ops.ajouts.length || ops.modifs.length || ops.retraits.length)) {
    ops = verifierEcritures(ops, await relireFrais(), cle);
  }
  await Promise.all([
    ...ops.ajouts.map((l) => store.add(col, l)),
    ...ops.modifs.map(([a, l]) => store.update(col, a.id, l)),
    ...ops.retraits.map((a) => store.remove(col, a.id)),
  ]);
}

// Propose les repas des 7 prochains jours. Les repas 📌 gardés et « mangé ailleurs » ne bougent pas.
// { changer: id }      : ne change que ce repas-là, tous les autres restent.
// { completer: true }  : aucun repas existant ne change ; les créneaux vides sont remplis et la liste de courses
//                        est refaite (mode automatique, et après « mangé ailleurs »).
// Dans tous les cas : un repas dont la recette a été supprimée, ou est exclue (four, je n'aime pas) sans être
// 📌 gardé, est remplacé. Une ligne du planning sans recette (ajoutée à la main dans Notion : « resto avec Paul »)
// et une ligne de courses ajoutée à la main (sans « Source du prix ») ne sont jamais touchées.
const manuelle = (c) => !c.source && c.unite !== 'placard';

// Dernière proposition faite à la main : on garde l'état d'avant 10 minutes pour pouvoir l'annuler.
let annulation = null;

async function proposer({ changer, completer = false } = {}) {
  await relire(); // Notion tel qu'il est maintenant, pas le cache
  const m = maintenantParis();
  const [{ recettes, t, analyses }, regl, planning, courses, stock] = await Promise.all([
    contexte(), reglages(), store.list('planning'), store.list('courses'), store.list('stock'),
  ]);
  verifier(recettes.length > 0, "Ajoute d'abord quelques recettes.");
  const exclues = exclusionsDe(recettes, analyses, regl);
  const { lieu } = await presence();
  const cle = (p) => cleCreneau(p.date, p.moment);
  const aVenir = planning.filter((p) => p.date && p.moment && !p.consomme && !estPasse(p.date, p.moment, m));
  const aLaMain = new Set(aVenir.filter((p) => !p.recette && !p.ailleurs).map(cle));
  // Les 7 prochains jours : Repax ne remplit, ne modifie ni ne retire rien en dehors (un repas déplacé à la main
  // au-delà, dans Notion, reste tel quel).
  const fenetre = creneauxAVenir(regl.repas, m);
  const dansFenetre = new Set(fenetre.map(cle));
  const geres = aVenir.filter((p) => !aLaMain.has(cle(p)) && dansFenetre.has(cle(p)));
  // Un repas coché « Consommé » occupe son créneau (le soir d'aujourd'hui avant 21 h, par exemple) : rien à y ajouter.
  const occupes = new Set(planning.filter((p) => p.date && p.moment && p.consomme).map(cle));
  // Seulement les repas où je suis à Angoulême (d'après Agendix : « Angoulême » n'est pas une absence),
  // hors repas notés à la main et créneaux déjà occupés.
  const creneaux = fenetre.filter((c) => lieu(c) === 'Angoulême' && !aLaMain.has(cle(c)) && !occupes.has(cle(c)));
  const produits = new Map(CATALOGUE.filter((e) => !e.placard).map((e) => [e.nom, { ...e, prix: t.get(e.nom).prix }]));

  const parCreneau = new Map(geres.map((p) => [cle(p), p]));
  const cible = changer && geres.find((p) => p.id === changer);
  verifier(!changer || cible, 'Repas introuvable');
  const fixes = new Map(), exclus = new Map();
  if (cible) exclus.set(cle(cible), cible.recette);
  // Dans l'ordre : un repas de restes n'est gardé que si le soir d'avant l'est aussi.
  let precedentFixe = false;
  for (const c of creneaux) {
    const p = parCreneau.get(cle(c));
    const valable = p && (p.ailleurs || (analyses.has(p.recette) && (p.garde || !exclues.has(p.recette))));
    const garder = valable && p !== cible && (cible || completer || p.garde || p.ailleurs) && (!p.restes || precedentFixe);
    if (garder) fixes.set(cle(c), p);
    precedentFixe = !!garder && !p.ailleurs; // soir mangé ailleurs : pas de restes le lendemain
  }

  const plan = planifier({
    recettes: recettes.map((r) => {
      const a = analyses.get(r.id);
      return {
        id: r.id,
        type: typeDe(r, a),
        exclue: exclues.has(r.id),
        favori: !!r.favori,
        besoins: a.lignes.filter((l) => !l.placard).map((l) =>
          l.inconnu ? { nom: l.nom, inconnu: true, cout: l.cout / a.portions } : { nom: l.nom, qte: l.qte / a.portions }
        ),
      };
    }),
    produits,
    stock: stock.filter((s) => s.quantite > 0 && PRODUITS.has(s.nom)).map((s) => ({ nom: s.nom, quantite: s.quantite, peremption: s.peremption })),
    creneaux,
    reglages: regl,
    fixes,
    exclus,
  });

  // Épices et condiments utilisés : rappel « à avoir au placard », sans prix.
  const epices = new Set();
  for (const r of plan.repas) {
    if (!r.restes && !r.ailleurs && r.recette) for (const l of analyses.get(r.recette).lignes) if (l.placard && l.detail) epices.add(l.detail);
  }

  // Repas à venir et liste : les lignes existantes sont réutilisées (moins d'écritures dans Notion).
  // « Coût estimé » d'un repas = ce que coûtent les ingrédients mangés (au prorata), pas le paquet acheté pour l'occasion.
  const noms = new Map(recettes.map((r) => [r.id, r.nom]));
  const nouveauxRepas = plan.repas.map((r) => complet('planning', {
    repas: fixes.get(cle(r))?.repas || noms.get(r.recette), date: r.date, moment: r.moment, recette: r.recette,
    cout: r.restes || r.ailleurs || !r.recette ? 0 : arrondi(analyses.get(r.recette).coutPortion * r.portions),
    portions: r.portions, restes: !!r.restes, consomme: false, garde: !!r.garde, ailleurs: !!r.ailleurs,
  }));
  const nouvellesCourses = [
    ...plan.achats.map((a) => complet('courses', a.inconnu
      ? { article: a.nom, cout: arrondi(a.cout), unite: 'fois', achete: false, pour: a.pour, source: SOURCES.estimation }
      : {
          article: a.nom, paquets: a.paquets, quantite: arrondi3(a.quantite), besoin: arrondi3(a.besoin),
          unite: produits.get(a.nom).unite, cout: arrondi(a.cout), achete: false, pour: a.pour,
          source: t.get(a.nom).source, produit: t.get(a.nom).id,
        })),
    ...[...epices].map((e) => complet('courses', { article: e[0].toUpperCase() + e.slice(1), unite: 'placard', cout: 0, achete: false })),
  ];
  if (!completer) {
    annulation = {
      quand: Date.now(),
      planning: geres.map((p) => complet('planning', p)),
      courses: courses.filter((c) => !c.achete && !manuelle(c)).map((c) => complet('courses', c)),
      fenetre: [...dansFenetre],
    };
  }
  // Un article acheté reste affiché (coché) le jour même et le lendemain, puis quitte la liste : il est au placard.
  const hier = ajouterJours(m.date, -1);
  const anciens = courses.filter((c) => c.achete && !manuelle(c) && !stock.some((s) => s.origine === c.id && s.achat >= hier));
  await Promise.all([
    remplacerLignes('planning', geres, nouveauxRepas, cle, relirePlanning),
    remplacerLignes('courses', courses.filter((c) => !c.achete && !manuelle(c)), nouvellesCourses, (c) => c.article),
    ...anciens.map((c) => store.remove('courses', c.id)),
  ]);
  return plan.gaspillage.map((g) => ({ nom: g.nom, valeur: arrondi(g.valeur) })).filter((g) => g.valeur >= 0.05);
}

app.post('/api/semaine', async (req, res) => {
  const completer = req.body?.completer === true || req.body?.recalculer === true;
  const gaspillage = await enSerie(async () => {
    await relire();
    await consommerPasses();
    return proposer({ changer: req.body?.changer, completer });
  });
  res.json({ ...(await vue()), gaspillage });
});

app.post('/api/semaine/annuler', async (req, res) => {
  await enSerie(async () => {
    verifier(annulation && Date.now() - annulation.quand < 10 * 60e3, 'Plus rien à annuler');
    await relire();
    const m = maintenantParis();
    const cle = (p) => cleCreneau(p.date, p.moment);
    const [planning, courses] = await Promise.all([store.list('planning'), store.list('courses')]);
    // Seulement les repas des 7 jours qui avaient été proposés : le reste du planning n'est pas touché.
    const fenetre = new Set(annulation.fenetre);
    const aVenir = planning.filter((p) => p.date && p.moment && !p.consomme && !estPasse(p.date, p.moment, m) && (p.recette || p.ailleurs) && fenetre.has(cle(p)));
    await Promise.all([
      remplacerLignes('planning', aVenir, annulation.planning.filter((p) => !estPasse(p.date, p.moment, m)), cle, relirePlanning),
      remplacerLignes('courses', courses.filter((c) => !c.achete && !manuelle(c)), annulation.courses, (c) => c.article),
    ]);
    annulation = null;
  });
  res.json(await vue());
});

// ➕ Ajouter une recette au planning, à un repas donné : elle y est 📌 gardée.
app.post('/api/planning', async (req, res) => {
  const { recette, date, moment } = req.body ?? {};
  verifier(/^\d{4}-\d{2}-\d{2}$/.test(date || '') && ['midi', 'soir'].includes(moment), 'Repas invalide');
  verifier(!estPasse(date, moment, maintenantParis()), 'Ce repas est déjà passé');
  await enSerie(async () => {
    const [r, regl, planning] = await Promise.all([trouver('recettes', recette), reglages(), store.list('planning')]);
    const ligne = { repas: r.nom, date, moment, recette: r.id, portions: regl.personnes, restes: false, garde: true, ailleurs: false, consomme: false };
    const existant = planning.find((p) => p.date === date && p.moment === moment && !p.consomme);
    verifier(!planning.some((p) => p.date === date && p.moment === moment && p.consomme), 'Ce repas est déjà mangé');
    if (existant) await store.update('planning', existant.id, ligne);
    else await store.add('planning', ligne);
  });
  declencher();
  res.json({ ok: true });
});

// 🛒 Article libre dans la liste (« papier toilette ») : jamais touché par le planning automatique.
app.post('/api/courses', async (req, res) => {
  const article = String(req.body?.article || '').trim().slice(0, 80);
  verifier(article, 'Article vide');
  res.json(await store.add('courses', { article, achete: false }));
});

app.delete('/api/courses/:id', async (req, res) => {
  const c = await trouver('courses', req.params.id);
  verifier(manuelle(c), 'Seuls les articles ajoutés à la main se suppriment ici');
  await store.remove('courses', c.id);
  res.json({ ok: true });
});

// --- Mode automatique (remplace la tâche planifiée « Planning repas quotidien ») -------------
// Toutes les 10 minutes, et 2 secondes après chaque action dans l'appli :
//  1. range le placard (noms et unités du catalogue) et y met les articles cochés « Acheté » dans Notion ;
//  2. retire du placard ce qu'ont utilisé les repas passés ;
//  3. complète le planning des 7 prochains jours sans toucher aux repas existants, et refait la liste ;
//  4. remplit les colonnes vides des recettes (type, difficulté, coûts).
// Les modifications faites à la main dans Notion sont vues au plus tard 10 minutes après (cache).
const etatAuto = { dernier: null, erreur: null };

const ajouterAuPlacard = (c, e) => {
  const jour = aujourdhui();
  const depart = c.pour && c.pour > jour ? c.pour : jour; // acheté pour un repas plus tard : congelé ou acheté à temps
  return store.add('stock', { nom: e.nom, quantite: c.quantite, unite: e.unite, achat: jour, peremption: ajouterJours(depart, e.garde), origine: c.id });
};

async function rangerPlacard() {
  const [stock, courses] = await Promise.all([store.list('stock'), store.list('courses')]);
  for (const s of stock) {
    const e = PRODUITS.get(s.nom) || lireLigne(s.nom || '').entree;
    if (e && !e.placard && (e.nom !== s.nom || s.unite !== e.unite)) await store.update('stock', s.id, { nom: e.nom, unite: e.unite });
  }
  for (const c of courses.filter((x) => x.achete && x.quantite > 0)) {
    const e = PRODUITS.get(c.article);
    if (e && !e.placard && !stock.some((s) => s.origine === c.id)) await ajouterAuPlacard(c, e);
  }
}

async function completerRecettes() {
  const { recettes, analyses } = await contexte();
  let ecrites = 0;
  for (const r of recettes) {
    const a = analyses.get(r.id);
    const patch = {};
    if (!r.type) patch.type = typeDe(r, a);
    if (!r.difficulte) patch.difficulte = difficulteDe(nbIngredients(a), r.etapes);
    if (!Number.isFinite(r.cout) || Math.abs(r.cout - a.cout) > 0.05) patch.cout = arrondi(a.cout);
    if (!Number.isFinite(r.coutPortion) || Math.abs(r.coutPortion - a.coutPortion) > 0.05) patch.coutPortion = arrondi(a.coutPortion);
    if (!Object.keys(patch).length) continue;
    await store.update('recettes', r.id, patch);
    if (++ecrites >= 20) break; // ponytail: 20 recettes par passage pour ménager Notion ; la suite au passage d'après
  }
}

function automatique() {
  return enSerie(async () => {
    await relire();
    // Première fois : les contraintes connues (seul, une poêle et une casserole, pas d'omelette…).
    const r = (await store.list('depenses')).find((d) => d.type === 'Budget');
    if (r && !r.exclusions && !r.sansFour) await store.update('depenses', r.id, { exclusions: EXCLUSIONS_DEFAUT, sansFour: true });
    const { recettes } = await contexte(); // charge aussi les synonymes
    await rangerPlacard();
    await consommerPasses();
    if (recettes.length) await proposer({ completer: true });
    await completerRecettes();
  }).then(
    () => Object.assign(etatAuto, { dernier: new Date().toISOString(), erreur: null }),
    (err) => {
      etatAuto.erreur = err.message;
      console.error('Mode automatique :', err.message);
    }
  );
}

let minuterie;
function declencher(delai = 2000) {
  clearTimeout(minuterie);
  minuterie = setTimeout(automatique, delai);
}

// 📌 Garder un repas (il ne bouge plus quand on repropose) ou le marquer « mangé ailleurs ».
app.patch('/api/planning/:id', async (req, res) => {
  const patch = {};
  for (const k of ['garde', 'ailleurs']) if (typeof req.body?.[k] === 'boolean') patch[k] = req.body[k];
  verifier(Object.keys(patch).length, 'Rien à changer');
  await enSerie(async () => {
    const p = await trouver('planning', req.params.id);
    verifier(!p.consomme, 'Ce repas est déjà passé');
    await store.update('planning', p.id, patch);
  });
  declencher();
  res.json({ ok: true });
});

// Cocher un article : le paquet entier entre au placard. Décocher : il en ressort.
app.patch('/api/courses/:id', async (req, res) => {
  const achete = !!req.body?.achete;
  await enSerie(async () => {
    const c = await trouver('courses', req.params.id);
    await store.update('courses', c.id, { achete });
    const e = PRODUITS.get(c.article);
    if (!e || e.placard || !(c.quantite > 0)) return;
    const lies = (await store.list('stock')).filter((s) => s.origine === c.id);
    if (achete && !lies.length) await ajouterAuPlacard(c, e);
    if (!achete) for (const s of lies) await store.remove('stock', s.id);
  });
  res.json({ ok: true });
});

// --- Placard (garde-manger) ----------------------------------------------------
app.post('/api/stock', async (req, res) => {
  const e = PRODUITS.get(req.body?.nom);
  const quantite = req.body?.quantite;
  verifier(e && !e.placard, 'Produit inconnu');
  verifier(Number.isFinite(quantite) && quantite > 0 && quantite < 1000, 'Quantité invalide');
  const jour = aujourdhui();
  await enSerie(() => store.add('stock', { nom: e.nom, quantite, unite: e.unite, achat: jour, peremption: ajouterJours(jour, e.garde), origine: 'manuel' }));
  declencher();
  res.json({ ok: true });
});

app.patch('/api/stock/:id', async (req, res) => {
  const quantite = req.body?.quantite;
  verifier(Number.isFinite(quantite) && quantite >= 0 && quantite < 1000, 'Quantité invalide');
  await enSerie(async () => {
    await trouver('stock', req.params.id);
    if (quantite === 0) await store.remove('stock', req.params.id);
    else await store.update('stock', req.params.id, { quantite });
  });
  declencher();
  res.json({ ok: true });
});

app.delete('/api/stock/:id', async (req, res) => {
  await enSerie(async () => {
    await trouver('stock', req.params.id);
    await store.remove('stock', req.params.id);
  });
  declencher();
  res.json({ ok: true });
});

// --- Budget & dépenses -------------------------------------------------------
app.get('/api/budget', async (req, res) => {
  const regl = await reglages();
  const jour = aujourdhui();
  const [debut, fin] = regl.periode === 'mois'
    ? [jour.slice(0, 8) + '01', ajouterJours(ajouterJours(jour.slice(0, 8) + '28', 4).slice(0, 8) + '01', -1)]
    : [lundi(jour), ajouterJours(lundi(jour), 6)];
  const depenses = (await store.list('depenses'))
    .filter((d) => d.type === 'Dépense')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dansPeriode = depenses.filter((d) => d.date >= debut && d.date <= fin);
  // Avec Argenx : les vraies dépenses « Courses » du relevé Revolut (base Notion « Courses payées »),
  // en plus de la saisie à la main (liquide…).
  let argenx = null, erreurArgenx = null;
  try {
    const payees = (await store.list('coursesPayees'))
      .filter((o) => o.date >= debut && o.date <= fin && Number.isFinite(o.montant))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (payees.length) {
      argenx = {
        total: arrondi(payees.reduce((s, o) => s + o.montant, 0)),
        operations: payees.slice(0, 50).map((o) => ({ date: o.date, libelle: o.libelle, montant: o.montant })),
      };
    }
  } catch (err) {
    console.error('Courses payées (Argenx) :', err.message);
    erreurArgenx = 'Base Notion « Courses payées » illisible : seules les dépenses saisies ici sont comptées.';
  }
  const depense = arrondi(dansPeriode.reduce((s, d) => s + (d.montant || 0), 0) + (argenx?.total || 0));
  // Ce que coûtent les repas de la période (estimé, au prorata) : à comparer à ce qui a vraiment été payé.
  const prevu = arrondi((await store.list('planning'))
    .filter((p) => p.date >= debut && p.date <= fin && !p.ailleurs)
    .reduce((s, p) => s + (p.cout || 0), 0));
  // 8 dernières semaines : budget, payé (saisi + Argenx) et prévu (repas).
  const [planning, payees, courses] = await Promise.all([
    store.list('planning'), store.list('coursesPayees').catch(() => []), store.list('courses'),
  ]);
  const somme = (lignes, du, au, champ) => lignes.filter((x) => x.date >= du && x.date <= au).reduce((s, x) => s + (x[champ] || 0), 0);
  const historique = Array.from({ length: 8 }, (_, i) => {
    const du = ajouterJours(lundi(jour), -7 * (7 - i)), au = ajouterJours(du, 6);
    return {
      du,
      budget: arrondi(budgetSemaine(regl)),
      paye: arrondi(somme(depenses, du, au, 'montant') + somme(payees, du, au, 'montant')),
      prevu: arrondi(somme(planning.filter((p) => !p.ailleurs), du, au, 'cout')),
    };
  });
  // Fin du mois : déjà payé ce mois-ci + ce qui reste à acheter dans la liste.
  const debutMois = jour.slice(0, 8) + '01';
  const payeMois = somme(depenses, debutMois, jour, 'montant') + somme(payees, debutMois, jour, 'montant');
  const resteAAcheter = courses.filter((c) => !c.achete).reduce((s, c) => s + (c.cout || 0), 0);
  const mois = {
    paye: arrondi(payeMois),
    projection: arrondi(payeMois + resteAAcheter),
    budget: arrondi(regl.periode === 'mois' ? regl.budget : (regl.budget * 52) / 12),
  };
  res.json({ ...regl, debut, fin, depense, prevu, reste: arrondi(regl.budget - depense), depenses: depenses.slice(0, 50), argenx, erreurArgenx, historique, mois });
});

app.post('/api/depenses', async (req, res) => {
  const { montant, libelle, date, magasin } = req.body ?? {};
  verifier(Number.isFinite(montant) && montant > 0 && montant < 10000, 'Montant invalide');
  verifier(/^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'Date invalide');
  res.json(await store.add('depenses', {
    libelle: String(libelle || 'Courses').slice(0, 100), type: 'Dépense', montant: arrondi(montant), date,
    magasin: String(magasin || '').slice(0, 100),
  }));
});

app.delete('/api/depenses/:id', async (req, res) => {
  const d = await trouver('depenses', req.params.id);
  verifier(d.type === 'Dépense', 'Ce n’est pas une dépense');
  await store.remove('depenses', req.params.id);
  res.json({ ok: true });
});

// --- À vérifier : ingrédients non reconnus → synonyme d'un produit ---------------
app.get('/api/a-verifier', async (req, res) => {
  const { recettes, analyses } = await contexte();
  const mots = new Map();
  for (const r of recettes) {
    for (const l of analyses.get(r.id).lignes) {
      if (!l.inconnu || !l.detail) continue;
      const x = mots.get(l.detail) || { mot: l.detail, ligne: l.brut, recettes: [] };
      if (!x.recettes.includes(r.nom)) x.recettes.push(r.nom);
      mots.set(l.detail, x);
    }
  }
  res.json({
    mots: [...mots.values()].sort((a, b) => b.recettes.length - a.recettes.length || a.mot.localeCompare(b.mot, 'fr')),
    produits: CATALOGUE.map((e) => e.nom),
  });
});

// « sirop de grenadine » → Sucre : retenu dans la colonne Synonymes de Produits & prix.
app.post('/api/synonymes', async (req, res) => {
  const mot = norm(req.body?.mot || '');
  const e = PRODUITS.get(req.body?.produit);
  verifier(mot && mot.length <= 80, 'Mot invalide');
  verifier(e, 'Produit inconnu');
  await enSerie(async () => {
    const lignes = (await store.list('produits')).filter((p) => p.nom === e.nom);
    const cible = lignes.find((p) => p.source !== SOURCES.manuel) || lignes[0];
    if (cible) await store.update('produits', cible.id, { synonymes: [cible.synonymes, mot].filter(Boolean).join(', ') });
    else await store.add('produits', { nom: e.nom, categorie: e.rayon, unite: e.unite, prix: e.estimation, source: SOURCES.estimation, synonymes: mot });
  });
  declencher();
  res.json({ ok: true });
});

// --- Erreurs -----------------------------------------------------------------
app.use((err, req, res, next) => {
  if (!(err instanceof ErreurUtilisateur)) console.error(err);
  res.status(err instanceof ErreurUtilisateur ? 400 : 500).json({ erreur: err.message });
});

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
  console.log(`Gestion des repas sur http://localhost:${PORT} (mode ${store.mode})`);
  declencher(5000);
  setInterval(() => declencher(0), 10 * 60e3);
});
