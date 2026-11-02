const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const marmiton = require('./marmiton');
const prix = require('./prix');
const { CATALOGUE, SOURCES, tarifs, analyserRecette } = require('./ingredients');
const { planifier, listeCourses, lundi, ajouterJours, aujourdhui, budgetSemaine } = require('./planning');

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
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REGLAGES_DEFAUT = { budget: 60, periode: 'semaine', personnes: 1, repas: ['midi', 'soir'] };
const rayonDe = (nom) => CATALOGUE.find((e) => e.nom === nom)?.rayon || 'Autres';

class ErreurUtilisateur extends Error {}
const verifier = (ok, message) => {
  if (!ok) throw new ErreurUtilisateur(message);
};

async function reglages() {
  const r = (await store.list('depenses')).find((d) => d.type === 'Budget');
  if (!r) return { ...REGLAGES_DEFAUT };
  return { id: r.id, budget: r.montant ?? 60, periode: r.periode || 'semaine', personnes: r.personnes || 1, repas: r.repas?.length ? r.repas : ['midi', 'soir'] };
}

async function contexte() {
  const [recettes, produits] = await Promise.all([store.list('recettes'), store.list('produits')]);
  const t = tarifs(produits);
  const analyses = new Map(recettes.map((r) => [r.id, { portions: r.portions || 4, ...analyserRecette(r, t) }]));
  return { recettes, produits, t, analyses };
}

// Vérifie qu'une ligne appartient bien à la base avant de la modifier.
async function trouver(col, id) {
  const ligne = (await store.list(col)).find((x) => x.id === id);
  verifier(ligne, 'Élément introuvable');
  return ligne;
}

const arrondi = (x) => Math.round(x * 100) / 100;

// --- État et réglages --------------------------------------------------------
app.get('/api/etat', (req, res) => {
  res.json({ mode: store.mode, motDePasse: !!MOT_DE_PASSE });
});

app.get('/api/reglages', async (req, res) => {
  res.json(await reglages());
});

app.put('/api/reglages', async (req, res) => {
  const { budget, periode, personnes, repas } = req.body ?? {};
  verifier(
    Number.isFinite(budget) && budget >= 0 && budget <= 10000 &&
    ['semaine', 'mois'].includes(periode) &&
    Number.isInteger(personnes) && personnes >= 1 && personnes <= 20 &&
    Array.isArray(repas) && repas.length > 0 && repas.every((r) => ['midi', 'soir'].includes(r)),
    'Réglages invalides'
  );
  const ligne = { libelle: 'Réglages', type: 'Budget', montant: budget, periode, personnes, repas: [...new Set(repas)], date: aujourdhui() };
  const actuel = await reglages();
  if (actuel.id) await store.update('depenses', actuel.id, ligne);
  else await store.add('depenses', ligne);
  res.json(await reglages());
});

// --- Recettes ----------------------------------------------------------------
const resumeRecette = (r, a) => ({
  id: r.id, nom: r.nom, url: r.url, portions: a.portions, temps: r.temps,
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
  const ligne = await store.add('recettes', { ...r, cout: arrondi(a.cout), coutPortion: arrondi(a.coutPortion), dateRecup: aujourdhui() });
  res.json({ id: ligne.id, nom: ligne.nom });
});

app.delete('/api/recettes/:id', async (req, res) => {
  await trouver('recettes', req.params.id);
  await store.remove('recettes', req.params.id);
  res.json({ ok: true });
});

// --- Prix --------------------------------------------------------------------
app.get('/api/prix', async (req, res) => {
  const produits = await store.list('produits');
  const t = tarifs(produits);
  const liste = CATALOGUE.filter((e) => !e.placard).map((e) => {
    const p = t.get(e.nom);
    return { nom: e.nom, rayon: e.rayon, unite: e.unite, prix: p.prix, source: p.source, date: p.date, openPrices: !!(e.tag || e.cat) };
  });
  res.json({ liste, etat: prix.etat });
});

app.put('/api/prix/:nom', async (req, res) => {
  const e = CATALOGUE.find((x) => x.nom === req.params.nom && !x.placard);
  verifier(e, 'Produit inconnu');
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

// --- Semaine : planning + liste de courses ------------------------------------
const debutSemaine = (v) => lundi(DATE.test(v || '') ? v : aujourdhui());

async function semaine(debut) {
  const [planning, courses, regl, recettes] = await Promise.all([
    store.list('planning'), store.list('courses'), reglages(), store.list('recettes'),
  ]);
  const urls = new Map(recettes.map((r) => [r.id, r.url]));
  const repas = planning
    .filter((p) => p.semaine === debut)
    .sort((a, b) => (a.date + a.moment).localeCompare(b.date + b.moment))
    .map((p) => ({ ...p, url: urls.get(p.recette) || null, supprimee: !urls.has(p.recette) }));
  const liste = courses
    .filter((c) => c.semaine === debut)
    .map((c) => ({ ...c, rayon: rayonDe(c.article) }))
    .sort((a, b) => a.rayon.localeCompare(b.rayon, 'fr') || a.article.localeCompare(b.article, 'fr'));
  return {
    debut,
    fin: ajouterJours(debut, 6),
    budget: arrondi(budgetSemaine(regl)),
    total: arrondi(liste.reduce((s, c) => s + (c.cout || 0), 0)),
    resteAAcheter: arrondi(liste.filter((c) => !c.achete).reduce((s, c) => s + (c.cout || 0), 0)),
    repas,
    courses: liste,
  };
}

app.get('/api/semaine', async (req, res) => {
  res.json(await semaine(debutSemaine(req.query.debut)));
});

app.post('/api/semaine', async (req, res) => {
  const debut = debutSemaine(req.body?.debut);
  const [{ recettes, analyses }, regl, planning, courses] = await Promise.all([
    contexte(), reglages(), store.list('planning'), store.list('courses'),
  ]);
  verifier(recettes.length > 0, "Ajoute d'abord quelques recettes.");
  const anciennesCourses = courses.filter((c) => c.semaine === debut);
  const achetes = new Set(anciennesCourses.filter((c) => c.achete).map((c) => c.article));

  const plan = planifier({
    recettes: recettes.map((r) => {
      const a = analyses.get(r.id);
      return { id: r.id, coutPortion: a.coutPortion, ingredients: new Set(a.lignes.filter((l) => !l.placard).map((l) => l.nom)) };
    }),
    reglages: regl,
    semaine: debut,
    achetes,
  });

  await Promise.all([
    ...planning.filter((p) => p.semaine === debut).map((p) => store.remove('planning', p.id)),
    ...anciennesCourses.map((c) => store.remove('courses', c.id)),
  ]);
  const noms = new Map(recettes.map((r) => [r.id, r.nom]));
  await Promise.all([
    ...plan.repas.map((r) => store.add('planning', { repas: noms.get(r.recette), date: r.date, moment: r.moment, recette: r.recette, semaine: debut, cout: arrondi(r.cout) })),
    ...listeCourses(plan.repas, analyses, regl.personnes).map((c) =>
      store.add('courses', { ...c, semaine: debut, achete: achetes.has(c.article) })
    ),
  ]);
  res.json(await semaine(debut));
});

app.patch('/api/courses/:id', async (req, res) => {
  await trouver('courses', req.params.id);
  res.json(await store.update('courses', req.params.id, { achete: !!req.body?.achete }));
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
  verifier(DATE.test(date || ''), 'Date invalide');
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
