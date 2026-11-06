// Widget iPhone (Scriptable) : GET /api/widget/repas.
// Lecture seule et sans aucun appel à Notion : on renvoie ce que l'appli a déjà en mémoire (instantané pris à chaque
// passage du mode automatique et à chaque action). Seul le « prochain repas » est recalculé à l'heure de la requête,
// parce qu'il change à 14 h et à 21 h sans qu'aucune donnée ne bouge.
const crypto = require('crypto');
const { maintenantParis, estPasse, cleCreneau, lieuDe, ajouterJours } = require('./planning');

const arrondi = (x) => Math.round(x * 100) / 100;

// 2026-11-04T21:30:00+01:00 (heure de Paris, avec son décalage).
function isoParis(d) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hourCycle: 'h23', timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  const decalage = parts.timeZoneName.replace('GMT', '') || '+00:00'; // « GMT+1 » ou « GMT+01:00 » selon la version d'ICU
  const [, signe, h, mn = '00'] = decalage.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${signe}${h.padStart(2, '0')}:${mn}`;
}

// instantane : { quand: Date, planning: [], courses: [], presence: [], recettes: Map id → { nom, temps, articles: [] } }
function construire(instantane, maintenant = new Date()) {
  const { planning, courses, presence, recettes } = instantane;
  const m = maintenantParis(maintenant);
  const demain = ajouterJours(m.date, 1);

  // Repas encore à venir : ni mangé (Consommé), ni mangé ailleurs, ni passé (14 h / 21 h), ni pendant une absence
  // d'après Présence (« Angoulême » est le lieu par défaut, pas une absence). Un seul repas par créneau.
  const vus = new Set();
  const aVenir = planning
    .filter((p) => p.date && ['midi', 'soir'].includes(p.moment) && !p.consomme && !p.ailleurs &&
      !estPasse(p.date, p.moment, m) && lieuDe(presence, p.date, p.moment) === 'Angoulême')
    .sort((a, b) => cleCreneau(a.date, a.moment).localeCompare(cleCreneau(b.date, b.moment)))
    .filter((p) => {
      const k = cleCreneau(p.date, p.moment);
      return !vus.has(k) && vus.add(k);
    });

  const repas = (p) => p && {
    date: p.date,
    moment: p.moment,
    name: p.repas || recettes.get(p.recette)?.nom || '',
    minutes: recettes.get(p.recette)?.temps ?? null,
    cost: Number.isFinite(p.cout) ? arrondi(p.cout) : null,
  };

  // Courses : ce qui reste à acheter (hors placard : sel, poivre…). « Pour le » est recalculé d'après le planning réel
  // (premier repas à venir qui utilise l'article) ; la valeur stockée ne sert que si aucun repas ne l'utilise et qu'elle n'est pas périmée.
  const premierBesoin = (article) => aVenir.find((p) => !p.restes && recettes.get(p.recette)?.articles.includes(article))?.date;
  const aAcheter = courses.filter((c) => !c.achete && c.unite !== 'placard');
  const urgents = aAcheter
    .map((c) => ({ name: c.article, neededOn: premierBesoin(c.article) ?? (c.pour >= m.date ? c.pour : null) }))
    .filter((c) => c.neededOn && c.neededOn <= demain)
    .sort((a, b) => a.neededOn.localeCompare(b.neededOn) || a.name.localeCompare(b.name, 'fr'));

  return {
    updatedAt: isoParis(instantane.quand),
    next: repas(aVenir[0]) ?? null,
    after: repas(aVenir[1]) ?? null,
    shopping: { toBuyCount: aAcheter.length, urgentCount: urgents.length, urgent: urgents.slice(0, 3) },
  };
}

// Fenêtre fixe : au plus `max` appels par `duree` ms et par clé.
function limiteur(max, duree) {
  const compteurs = new Map();
  return (cle, maintenant = Date.now()) => {
    for (const [k, c] of compteurs) if (c.fin <= maintenant) compteurs.delete(k);
    const c = compteurs.get(cle) ?? { n: 0, fin: maintenant + duree };
    compteurs.set(cle, c);
    return ++c.n <= max ? 0 : Math.ceil((c.fin - maintenant) / 1000); // 0 = ok, sinon secondes à attendre
  };
}

// Jeton comparé en temps constant (on compare des empreintes, de même longueur quelle que soit l'entrée).
const empreinte = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Route Express. `jeton` : WIDGET_TOKEN (au moins 32 caractères, sinon la route est désactivée) ;
// `instantane()` : dernier état en mémoire (ou null s'il n'y en a pas encore).
function routeWidget({ jeton, instantane, parHeure = 60, echecsParHeure = 20, maintenant = () => new Date() }) {
  const actif = typeof jeton === 'string' && jeton.length >= 32;
  const attendu = actif && empreinte(jeton);
  const limiteReussites = limiteur(parHeure, 3600e3);
  const limiteEchecs = limiteur(echecsParHeure, 3600e3);
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!actif) return res.status(404).end();
    const fourni = (req.headers.authorization || '').match(/^Bearer (\S+)$/i)?.[1];
    if (!fourni || !crypto.timingSafeEqual(empreinte(fourni), attendu)) {
      const attente = limiteEchecs(req.ip);
      if (attente) return res.status(429).set('Retry-After', String(attente)).end();
      return res.status(401).set('WWW-Authenticate', 'Bearer').end();
    }
    const attente = limiteReussites('jeton');
    if (attente) return res.status(429).set('Retry-After', String(attente)).json({ erreur: 'Trop de requêtes' });
    const inst = instantane();
    if (!inst) return res.status(503).set('Retry-After', '30').json({ erreur: "Pas encore de données : l'appli vient de démarrer" });
    res.json(construire(inst, maintenant()));
  };
}

module.exports = { construire, routeWidget, limiteur, isoParis };
