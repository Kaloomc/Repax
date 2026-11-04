// Récupération des recettes Marmiton. Il n'y a pas d'API officielle :
// on lit les pages publiques avec parcimonie (une requête toutes les 3 secondes,
// user-agent honnête, recherches gardées en cache 24 h, recettes enregistrées
// une fois pour toutes). Si Marmiton change son site, ceci peut casser.
const { limiteur } = require('./prix');

const BASE = 'https://www.marmiton.org';
const UA = 'gestion-repas/1.0 (projet perso; https://github.com/Kaloomc/Repax)';
const URL_RECETTE = /^https:\/\/www\.marmiton\.org\/recettes\/recette_[a-z0-9-]+_\d+\.aspx$/;

const enFile = limiteur(3000);
const page = (url) =>
  enFile(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR' } });
    if (!res.ok) throw new Error(`Marmiton a répondu ${res.status}`);
    return res.text();
  });

const cache = new Map();

async function rechercher(mot) {
  const cle = mot.toLowerCase().trim();
  const deja = cache.get(cle);
  if (deja && Date.now() - deja.date < 24 * 3600 * 1000) return deja.resultats;
  // Seule la première page de résultats : robots.txt de Marmiton interdit les suivantes.
  const html = await page(`${BASE}/recettes/recherche.aspx?aqt=${encodeURIComponent(cle)}`);
  const vus = new Set();
  const resultats = [];
  for (const [, slug, id] of html.matchAll(/href="\/recettes\/recette_([a-z0-9-]+)_(\d+)\.aspx"/g)) {
    if (vus.has(id)) continue;
    vus.add(id);
    const titre = slug.replace(/-/g, ' ');
    resultats.push({ titre: titre[0].toUpperCase() + titre.slice(1), url: `${BASE}/recettes/recette_${slug}_${id}.aspx` });
  }
  cache.set(cle, { date: Date.now(), resultats });
  return resultats;
}

// "PT1H20M" → 80
const minutes = (iso) => {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? Number(m[1] || 0) * 60 + Number(m[2] || 0) : null;
};

// Lit les données structurées (JSON-LD "Recipe") de la page.
function lireRecette(html, url) {
  for (const [, bloc] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(bloc); } catch { continue; }
    const objets = [data, ...(data['@graph'] || [])].flat();
    const r = objets.find((o) => [o?.['@type']].flat().includes('Recipe'));
    if (!r) continue;
    return {
      nom: String(r.name).split(' : ')[0].trim(),
      url,
      portions: parseInt([r.recipeYield].flat()[0], 10) || 4,
      temps: minutes(r.totalTime),
      ingredients: (r.recipeIngredient || []).join('\n'),
      // Étapes numérotées, une par ligne (comme dans la base Notion).
      etapes: [r.recipeInstructions || []].flat()
        .map((e) => String(typeof e === 'string' ? e : e?.text || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((e, i) => `${i + 1}. ${e}`)
        .join('\n'),
      // Infos de la page hors JSON-LD (facultatives) : "facile", "plat-principal"…
      difficulte: html.match(/"recipeDifficulty":"([^"]+)"/)?.[1] || null,
      typeMarmiton: html.match(/"recipeType":"([^"]+)"/)?.[1] || null,
    };
  }
  throw new Error("Recette illisible : Marmiton a peut-être changé son site.");
}

async function recuperer(url) {
  if (!URL_RECETTE.test(url)) throw new Error('Ce lien ne ressemble pas à une recette Marmiton.');
  return lireRecette(await page(url), url);
}

module.exports = { rechercher, recuperer, lireRecette, URL_RECETTE };
