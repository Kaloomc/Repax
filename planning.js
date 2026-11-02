// Choix des repas de la semaine par règles (pas d'IA) et liste de courses.

const JOUR = 24 * 3600 * 1000;

// Date du jour à Paris, au format AAAA-MM-JJ.
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

const ajouterJours = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * JOUR).toISOString().slice(0, 10);

// Lundi de la semaine qui contient cette date.
const lundi = (iso) => ajouterJours(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));

const budgetSemaine = (reglages) => (reglages.periode === 'mois' ? (reglages.budget * 12) / 52 : reglages.budget);

// Règles, pour chaque repas dans l'ordre :
//  1. rester dans le budget : un repas ne peut pas coûter plus que ce qui reste,
//     moins ce qu'il faut garder pour les repas suivants (au prix de la recette la moins chère) ;
//  2. varier : une recette au plus 2 fois par semaine, jamais deux repas de suite ;
//  3. réutiliser les ingrédients déjà prévus ou déjà achetés (moins de gaspillage) ;
//  4. un peu de hasard pour que deux propositions ne soient pas identiques.
// recettes : [{ id, coutPortion, ingredients: Set(noms) }]
function planifier({ recettes, reglages, semaine, achetes = new Set(), hasard = Math.random }) {
  const creneaux = [];
  for (let j = 0; j < 7; j++) for (const moment of ['midi', 'soir']) {
    if (reglages.repas.includes(moment)) creneaux.push({ date: ajouterJours(semaine, j), moment });
  }
  if (!recettes.length) return { repas: [], cout: 0 };

  const prix = (r) => r.coutPortion * reglages.personnes;
  const moinsChere = Math.min(...recettes.map(prix));
  const utilisations = new Map();
  const prevus = new Set(achetes);
  let reste = budgetSemaine(reglages);
  let precedente = null;
  const repas = [];

  creneaux.forEach((c, i) => {
    let candidates = recettes.filter((r) => (utilisations.get(r.id) || 0) < 2 && r.id !== precedente);
    if (!candidates.length) candidates = recettes.filter((r) => r.id !== precedente);
    if (!candidates.length) candidates = recettes;
    const aGarder = moinsChere * (creneaux.length - i - 1);
    const possibles = candidates.filter((r) => prix(r) <= reste - aGarder);
    const choix = possibles.length
      ? possibles
          .map((r) => {
            let communs = 0;
            for (const n of r.ingredients) if (prevus.has(n)) communs++;
            return { r, score: -(utilisations.get(r.id) || 0) * 5 + Math.min(communs, 4) + hasard() * 3 };
          })
          .sort((a, b) => b.score - a.score)[0].r
      : candidates.reduce((a, b) => (prix(a) <= prix(b) ? a : b)); // budget dépassé : la moins chère
    utilisations.set(choix.id, (utilisations.get(choix.id) || 0) + 1);
    for (const n of choix.ingredients) prevus.add(n);
    reste -= prix(choix);
    precedente = choix.id;
    repas.push({ ...c, recette: choix.id, cout: prix(choix) });
  });

  return { repas, cout: repas.reduce((s, r) => s + r.cout, 0) };
}

// Additionne les ingrédients de tous les repas prévus.
// ponytail: quantités au prorata, sans arrondir au paquet du magasin (on achète 1 kg de pâtes même s'il en faut 300 g).
function listeCourses(repas, analyses, personnes) {
  const articles = new Map();
  for (const r of repas) {
    const a = analyses.get(r.recette);
    if (!a) continue;
    const f = personnes / a.portions;
    for (const l of a.lignes) {
      const x = articles.get(l.nom) || { article: l.nom, quantite: 0, unite: l.unite, cout: 0, source: l.source, rayon: l.rayon, placard: l.placard, produit: l.produit };
      x.quantite += l.qte * f;
      x.cout += l.cout * f;
      articles.set(l.nom, x);
    }
  }
  return [...articles.values()].map((x) => ({ ...x, quantite: Math.round(x.quantite * 1000) / 1000, cout: Math.round(x.cout * 100) / 100 }));
}

module.exports = { planifier, listeCourses, lundi, ajouterJours, aujourdhui, budgetSemaine };
