// Prix depuis Open Prices (prices.openfoodfacts.org), API libre et collaborative.
const { CATALOGUE, SOURCES, norm } = require('./ingredients');

const API = 'https://prices.openfoodfacts.org/api/v1';
const UA = 'gestion-repas/1.0 (projet perso; https://github.com/Kaloomc/Repax)';
const VALIDITE = 7 * 24 * 3600 * 1000; // un prix est gardé 7 jours

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Une requête à la fois, avec un délai entre deux, pour ménager les sites.
function limiteur(ms) {
  let file = Promise.resolve();
  return (fn) => {
    const p = file.then(fn);
    file = p.catch(() => {}).then(() => pause(ms));
    return p;
  };
}

const enFile = limiteur(1000);
const getJSON = (url) =>
  enFile(async () => {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Open Prices a répondu ${res.status}`);
    return res.json();
  });

// Identifiants des magasins U (Super U, Hyper U, U Express, Marché U) connus d'Open Prices.
let magasinsU;
async function idsMagasinsU() {
  if (magasinsU) return magasinsU;
  const ids = [];
  for (const nom of ['Super U', 'Hyper U', 'U Express', 'Marché U']) {
    const r = await getJSON(`${API}/locations?osm_name__like=${encodeURIComponent(nom)}&price_count__gte=1&size=100`);
    ids.push(...r.items.map((l) => l.id));
  }
  return (magasinsU = ids);
}

const mediane = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : null;
};

// Prix par unité (kg, L ou pièce) tirés d'une liste de relevés Open Prices.
function prixUnitaires(items, e) {
  const out = [];
  for (const p of items) {
    if (p.currency !== 'EUR' || !(p.price > 0)) continue;
    if (e.tag) {
      const attendu = e.unite === 'pièce' ? 'UNIT' : 'KILOGRAM';
      if (p.price_per === attendu) out.push(p.price);
    } else {
      // Produit emballé : on garde ceux dont le nom correspond, et on ramène au kilo / litre.
      const nom = ' ' + norm(p.product?.product_name || '');
      const q = p.product?.product_quantity;
      if (q > 0 && e.noms.some((n) => nom.includes(' ' + n))) out.push(p.price / (q / 1000));
    }
  }
  return out;
}

async function chercher(e, magasins) {
  const filtre = e.tag ? `category_tag=${e.tag}` : `product__categories_tags__contains=${e.cat}`;
  const url = `${API}/prices?${filtre}&order_by=-date&size=100`;
  const u = prixUnitaires((await getJSON(`${url}&location_id__in=${magasins.join(',')}`)).items, e);
  if (u.length >= 2) return { prix: mediane(u), source: SOURCES.superU };
  const tous = prixUnitaires((await getJSON(url)).items, e);
  if (tous.length >= 2) return { prix: mediane(tous), source: SOURCES.autre };
  return null;
}

// Actualisation en tâche de fond de tous les prix trop vieux.
const etat = { enCours: false, fait: 0, total: 0, erreur: null, fin: null };

async function actualiser(store) {
  if (etat.enCours) return;
  Object.assign(etat, { enCours: true, fait: 0, erreur: null });
  try {
    const produits = await store.list('produits');
    const aFaire = CATALOGUE.filter((e) => {
      if (!e.tag && !e.cat) return false;
      const p = produits.find((x) => x.nom === e.nom && x.source !== SOURCES.manuel);
      return !p || !p.datePrix || Date.now() - new Date(p.datePrix) > VALIDITE;
    });
    etat.total = aFaire.length;
    const magasins = await idsMagasinsU();
    for (const e of aFaire) {
      const trouve = await chercher(e, magasins).catch(() => null);
      if (trouve) {
        const ligne = { nom: e.nom, categorie: e.rayon, unite: e.unite, prix: Math.round(trouve.prix * 100) / 100, source: trouve.source, datePrix: new Date().toISOString().slice(0, 10) };
        const ancien = produits.find((x) => x.nom === e.nom && x.source !== SOURCES.manuel);
        if (ancien) await store.update('produits', ancien.id, ligne);
        else await store.add('produits', ligne);
      }
      etat.fait++;
    }
  } catch (err) {
    etat.erreur = err.message;
  } finally {
    etat.enCours = false;
    etat.fin = new Date().toISOString();
  }
}

module.exports = { actualiser, etat, limiteur, prixUnitaires, mediane };
