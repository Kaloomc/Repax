const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const marmiton = require('./marmiton');
const prix = require('./prix');
const { CATALOGUE, PRODUITS, SOURCES, tarifs, analyserRecette } = require('./ingredients');
const {
  planifier, prendre, classer, TYPES, creneauxAVenir, estPasse, maintenantParis,
  lundi, ajouterJours, aujourdhui, budgetSemaine,
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
const REGLAGES_DEFAUT = { budget: 60, periode: 'semaine', personnes: 1, repas: ['midi', 'soir'], restes: false };
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
  };
}

async function contexte() {
  const [recettes, produits] = await Promise.all([store.list('recettes'), store.list('produits')]);
  const t = tarifs(produits);
  const analyses = new Map(recettes.map((r) => [r.id, { portions: r.portions || 4, ...analyserRecette(r, t) }]));
  return { recettes, produits, t, analyses };
}

const nbIngredients = (a) => a.lignes.filter((l) => !l.placard).length;
const typeDe = (r, a) => r.type || classer(r.nom, nbIngredients(a), r.difficulte || '');

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
    if (a && portions > 0) {
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
  res.json({ mode: store.mode, motDePasse: !!MOT_DE_PASSE });
});

app.put('/api/reglages', async (req, res) => {
  const { budget, periode, personnes, repas, restes = false } = req.body ?? {};
  verifier(
    Number.isFinite(budget) && budget >= 0 && budget <= 10000 &&
    ['semaine', 'mois'].includes(periode) &&
    Number.isInteger(personnes) && personnes >= 1 && personnes <= 20 &&
    Array.isArray(repas) && repas.length > 0 && repas.every((r) => ['midi', 'soir'].includes(r)) &&
    typeof restes === 'boolean',
    'Réglages invalides'
  );
  const ligne = { libelle: 'Réglages', type: 'Budget', montant: budget, periode, personnes, repas: [...new Set(repas)], restes, date: aujourdhui() };
  const actuel = await reglages();
  if (actuel.id) await store.update('depenses', actuel.id, ligne);
  else await store.add('depenses', ligne);
  res.json(await reglages());
});

// --- Recettes ----------------------------------------------------------------
const resumeRecette = (r, a) => ({
  id: r.id, nom: r.nom, url: r.url, portions: a.portions, temps: r.temps, difficulte: r.difficulte || null,
  type: typeDe(r, a), nbIngredients: nbIngredients(a),
  cout: arrondi(a.cout), coutPortion: arrondi(a.coutPortion), estime: a.estime,
  lignes: a.lignes.map((l) => ({ brut: l.brut, nom: l.nom, cout: arrondi(l.cout), source: l.source, inconnu: !!l.inconnu, placard: !!l.placard })),
});

app.get('/api/recettes', async (req, res) => {
  const { recettes, analyses } = await contexte();
  res.json(recettes.map((r) => resumeRecette(r, analyses.get(r.id))).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
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
  const ligne = await store.add('recettes', { ...r, type, cout: arrondi(a.cout), coutPortion: arrondi(a.coutPortion), dateRecup: aujourdhui() });
  res.json({ id: ligne.id, nom: ligne.nom, type });
});

app.patch('/api/recettes/:id', async (req, res) => {
  verifier(TYPES.includes(req.body?.type), 'Type de repas inconnu');
  await trouver('recettes', req.params.id);
  await store.update('recettes', req.params.id, { type: req.body.type });
  res.json({ ok: true });
});

app.delete('/api/recettes/:id', async (req, res) => {
  await trouver('recettes', req.params.id);
  await store.remove('recettes', req.params.id);
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
  const repas = planning
    .filter((p) => !estPasse(p.date, p.moment, m))
    .sort((a, b) => (a.date + a.moment).localeCompare(b.date + b.moment))
    .map((p) => {
      const r = parId.get(p.recette);
      return { ...p, url: r?.url || null, type: r ? typeDe(r, analyses.get(r.id)) : null, supprimee: !r };
    });
  const liste = courses
    .map((c) => ({ ...c, rayon: c.unite === 'placard' ? 'Placard' : rayonDe(c.article) }))
    .sort((a, b) => a.rayon.localeCompare(b.rayon, 'fr') || a.article.localeCompare(b.article, 'fr'));
  const creneaux = creneauxAVenir(regl.repas, m);
  return {
    debut: creneaux[0]?.date,
    fin: creneaux[creneaux.length - 1]?.date,
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

app.post('/api/semaine', async (req, res) => {
  const gaspillage = await enSerie(async () => {
    await consommerPasses();
    const m = maintenantParis();
    const [{ recettes, t, analyses }, regl, planning, courses, stock] = await Promise.all([
      contexte(), reglages(), store.list('planning'), store.list('courses'), store.list('stock'),
    ]);
    verifier(recettes.length > 0, "Ajoute d'abord quelques recettes.");
    const produits = new Map(CATALOGUE.filter((e) => !e.placard).map((e) => [e.nom, { ...e, prix: t.get(e.nom).prix }]));

    const plan = planifier({
      recettes: recettes.map((r) => {
        const a = analyses.get(r.id);
        return {
          id: r.id,
          type: typeDe(r, a),
          besoins: a.lignes.filter((l) => !l.placard).map((l) =>
            l.inconnu ? { nom: l.nom, inconnu: true, cout: l.cout / a.portions } : { nom: l.nom, qte: l.qte / a.portions }
          ),
        };
      }),
      produits,
      stock: stock.filter((s) => s.quantite > 0 && PRODUITS.has(s.nom)).map((s) => ({ nom: s.nom, quantite: s.quantite, peremption: s.peremption })),
      creneaux: creneauxAVenir(regl.repas, m),
      reglages: regl,
    });

    // Épices et condiments utilisés : rappel « à avoir au placard », sans prix.
    const epices = new Set();
    for (const r of plan.repas) {
      if (!r.restes) for (const l of analyses.get(r.recette).lignes) if (l.placard && l.detail) epices.add(l.detail);
    }

    // On remplace les repas à venir et la liste ; ce qui a été acheté est déjà au placard.
    await Promise.all([
      ...planning.filter((p) => !p.consomme && !estPasse(p.date, p.moment, m)).map((p) => store.remove('planning', p.id)),
      ...courses.map((c) => store.remove('courses', c.id)),
    ]);
    const noms = new Map(recettes.map((r) => [r.id, r.nom]));
    await Promise.all([
      ...plan.repas.map((r) => store.add('planning', {
        repas: noms.get(r.recette), date: r.date, moment: r.moment, recette: r.recette,
        cout: arrondi(r.cout), portions: r.portions, restes: r.restes, consomme: false,
      })),
      ...plan.achats.map((a) => store.add('courses', a.inconnu
        ? { article: a.nom, cout: arrondi(a.cout), unite: 'fois', achete: false, pour: a.pour, source: SOURCES.estimation }
        : {
            article: a.nom, paquets: a.paquets, quantite: arrondi3(a.quantite), besoin: arrondi3(a.besoin),
            unite: produits.get(a.nom).unite, cout: arrondi(a.cout), achete: false, pour: a.pour,
            source: t.get(a.nom).source, produit: t.get(a.nom).id,
          })),
      ...[...epices].map((e) => store.add('courses', { article: e[0].toUpperCase() + e.slice(1), unite: 'placard', cout: 0, achete: false })),
    ]);
    return plan.gaspillage.map((g) => ({ nom: g.nom, valeur: arrondi(g.valeur) })).filter((g) => g.valeur >= 0.05);
  });
  res.json({ ...(await vue()), gaspillage });
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
    if (achete && !lies.length) {
      const jour = aujourdhui();
      const depart = c.pour && c.pour > jour ? c.pour : jour; // acheté pour un repas plus tard : congelé ou acheté à temps
      await store.add('stock', { nom: e.nom, quantite: c.quantite, unite: e.unite, achat: jour, peremption: ajouterJours(depart, e.garde), origine: c.id });
    }
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
  res.json({ ok: true });
});

app.delete('/api/stock/:id', async (req, res) => {
  await enSerie(async () => {
    await trouver('stock', req.params.id);
    await store.remove('stock', req.params.id);
  });
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
  const depense = arrondi(dansPeriode.reduce((s, d) => s + (d.montant || 0), 0));
  res.json({ ...regl, debut, fin, depense, reste: arrondi(regl.budget - depense), depenses: depenses.slice(0, 50) });
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

// --- Erreurs -----------------------------------------------------------------
app.use((err, req, res, next) => {
  if (!(err instanceof ErreurUtilisateur)) console.error(err);
  res.status(err instanceof ErreurUtilisateur ? 400 : 500).json({ erreur: err.message });
});

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
  console.log(`Gestion des repas sur http://localhost:${PORT} (mode ${store.mode})`);
});
