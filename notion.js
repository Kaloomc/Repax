// Stockage dans Notion via l'API officielle (https://developers.notion.com).
// NOTION_TOKEN   : jeton de l'intégration Notion (reste sur le serveur)
// NOTION_PAGE_ID : page Notion commune à Repax, Agendix et Argenx. Les 6 bases de Repax y sont créées
//                  au premier lancement si besoin ; « Présence » (Agendix) et « Courses payées » (Argenx) y sont lues.
const VERSION = '2022-06-28';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const morceaux = (s, n) => (s.length ? s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')) : []);

const versNotion = (type, v) => ({
  title: () => ({ title: [{ text: { content: String(v ?? '').slice(0, 2000) } }] }),
  rich_text: () => ({ rich_text: morceaux(String(v ?? ''), 2000).slice(0, 100).map((c) => ({ text: { content: c } })) }),
  number: () => ({ number: Number.isFinite(v) ? v : null }),
  select: () => ({ select: v ? { name: String(v).replace(/,/g, ' ') } : null }),
  multi_select: () => ({ multi_select: (v || []).map((name) => ({ name })) }),
  date: () => ({ date: v ? { start: v } : null }),
  url: () => ({ url: v || null }),
  checkbox: () => ({ checkbox: !!v }),
  relation: () => ({ relation: v ? [{ id: v }] : [] }),
}[type]());

const depuisNotion = (p) => ({
  title: () => p.title.map((t) => t.plain_text).join(''),
  rich_text: () => p.rich_text.map((t) => t.plain_text).join(''),
  number: () => p.number,
  select: () => p.select?.name ?? null,
  multi_select: () => p.multi_select.map((o) => o.name),
  date: () => p.date?.start ?? null,
  url: () => p.url,
  checkbox: () => p.checkbox,
  relation: () => p.relation[0]?.id ?? null,
}[p.type]?.());

module.exports = function notion(SCHEMAS, nettoyer, graines) {
  const token = process.env.NOTION_TOKEN;
  // Accepte l'identifiant seul ou le lien complet de la page.
  const pageId = (process.env.NOTION_PAGE_ID || '').match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0];

  // Notion accepte environ 3 requêtes par seconde : on les espace de 340 ms.
  let prochain = 0;
  const tour = () => {
    const t = Math.max(Date.now(), prochain);
    prochain = t + 340;
    return pause(t - Date.now());
  };

  async function api(method, chemin, body) {
    for (let essai = 0; ; essai++) {
      await tour();
      const res = await fetch('https://api.notion.com/v1' + chemin, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
        body: body && JSON.stringify(body),
      });
      if ((res.status === 429 || res.status >= 500) && essai < 4) {
        await pause((Number(res.headers.get('retry-after')) || 1) * 1000);
        continue;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(`Notion : ${data.message}`);
      return data;
    }
  }

  // Bases présentes dans la page : titre → id.
  async function chercher() {
    if (!pageId) throw new Error('NOTION_PAGE_ID manquant : indique la page Notion qui accueille les bases.');
    const trouvees = {};
    let curseur;
    do {
      const r = await api('GET', `/blocks/${pageId}/children?page_size=100${curseur ? `&start_cursor=${curseur}` : ''}`);
      for (const b of r.results) if (b.type === 'child_database') trouvees[b.child_database.title] ??= b.id;
      curseur = r.next_cursor;
    } while (curseur);
    return trouvees;
  }

  // Trouve les bases dans la page, crée celles de Repax qui manquent.
  let bases;
  async function init() {
    const trouvees = await chercher();
    const ids = {};
    for (const [col, s] of Object.entries(SCHEMAS)) {
      // Base d'une autre appli (Agendix, Argenx) : on la lit telle quelle, sans la créer.
      if (s.externe) {
        ids[col] = trouvees[s.titre];
        continue;
      }
      const properties = {};
      for (const [nom, type, cible] of Object.values(s.champs)) {
        properties[nom] = type === 'relation' ? { relation: { database_id: ids[cible], single_property: {} } } : { [type]: {} };
      }
      if (trouvees[s.titre]) {
        // Base existante : on ajoute les colonnes apparues dans une nouvelle version de l'appli.
        ids[col] = trouvees[s.titre];
        const existantes = (await api('GET', `/databases/${ids[col]}`)).properties;
        const manquantes = Object.fromEntries(Object.entries(properties).filter(([nom, p]) => !existantes[nom] && !p.title));
        if (Object.keys(manquantes).length) await api('PATCH', `/databases/${ids[col]}`, { properties: manquantes });
        continue;
      }
      const db = await api('POST', '/databases', {
        parent: { type: 'page_id', page_id: pageId },
        title: [{ text: { content: s.titre } }],
        properties,
      });
      ids[col] = db.id;
      // Base toute neuve : quelques recettes d'exemple pour commencer.
      for (const r of graines[col] || []) await creer(ids, col, r);
    }
    return ids;
  }
  const getBases = () => (bases ??= init().catch((err) => { bases = null; throw err; }));

  const proprietes = (col, obj) =>
    Object.fromEntries(Object.entries(nettoyer(col, obj)).map(([k, v]) => {
      const [nom, type] = SCHEMAS[col].champs[k];
      return [nom, versNotion(type, v)];
    }));

  const lire = (col, page) => {
    const obj = { id: page.id };
    for (const [k, [nom]] of Object.entries(SCHEMAS[col].champs)) obj[k] = page.properties[nom] ? depuisNotion(page.properties[nom]) : null;
    return obj;
  };

  const creer = async (ids, col, obj) =>
    lire(col, await api('POST', '/pages', { parent: { database_id: ids[col] }, properties: proprietes(col, obj) }));

  async function charger(col) {
    const ids = await getBases();
    // Base d'une autre appli pas encore créée au démarrage : on la recherche, sinon elle est vide.
    if (SCHEMAS[col].externe && !ids[col]) ids[col] = (await chercher())[SCHEMAS[col].titre];
    if (!ids[col]) return [];
    const out = [];
    let curseur;
    do {
      const r = await api('POST', `/databases/${ids[col]}/query`, { page_size: 100, ...(curseur && { start_cursor: curseur }) });
      out.push(...r.results.map((p) => lire(col, p)));
      curseur = r.next_cursor;
    } while (curseur);
    return out;
  }

  // Cache en mémoire : relire une base Notion coûte une requête par 100 lignes, à 3 requêtes par seconde.
  // Repax est seul à écrire ses bases : ses propres écritures mettent le cache à jour. Il est quand même
  // relu de temps en temps pour voir les modifications faites à la main dans Notion, et plus souvent
  // pour les bases des autres applis (Présence, Courses payées).
  const DUREE = { propre: 10 * 60e3, externe: 2 * 60e3 };
  const cache = new Map(); // col → { lignes: Promise<[]>, quand }
  function entree(col) {
    const e = cache.get(col);
    if (e && Date.now() - e.quand < DUREE[SCHEMAS[col].externe ? 'externe' : 'propre']) return e;
    const neuve = { quand: Date.now() };
    neuve.lignes = charger(col).catch((err) => {
      if (cache.get(col) === neuve) cache.delete(col); // échec : on réessaiera au prochain appel
      throw err;
    });
    cache.set(col, neuve);
    return neuve;
  }
  // Applique une écriture au cache (même s'il est en train de se charger).
  function muter(col, f) {
    const e = cache.get(col);
    if (!e) return;
    e.lignes = e.lignes.then(f);
    e.lignes.catch(() => {}); // l'erreur éventuelle remonte déjà à qui lit la base
  }
  const remplacer = (col, ligne) => muter(col, (l) => [...l.filter((x) => x.id !== ligne.id), ligne]);

  return {
    mode: 'notion',
    list: async (col) => structuredClone(await entree(col).lignes),
    async add(col, obj) {
      const ligne = await creer(await getBases(), col, obj);
      remplacer(col, ligne);
      return ligne;
    },
    async update(col, id, patch) {
      const ligne = lire(col, await api('PATCH', `/pages/${id}`, { properties: proprietes(col, patch) }));
      remplacer(col, ligne);
      return ligne;
    },
    async remove(col, id) {
      await api('PATCH', `/pages/${id}`, { archived: true });
      muter(col, (l) => l.filter((x) => x.id !== id));
    },
  };
};
