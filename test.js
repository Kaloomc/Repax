// Vérifications rapides : npm test
const test = require('node:test');
const assert = require('node:assert');
const { lireLigne, tarifs, analyserRecette, PRODUITS, definirSynonymes } = require('./ingredients');
const { planifier, prendre, classer, creneauxAVenir, lundi, lieuDe, cleCreneau, raisonsExclusion, difficulteDe, difficulteLisible, preparerEcritures, verifierEcritures } = require('./planning');
const { prixUnitaires } = require('./prix');
const { lireRecette } = require('./marmiton');
const { construire, routeWidget, limiteur, isoParis } = require('./widget');

test('lecture des lignes de recette', () => {
  const cas = [
    ['200 g de farine', 'Farine', 0.2],
    ["3 gousses d'ail", 'Ail', 0.015],
    ["6 cuillères à soupe d'huile d'olive", "Huile d'olive", 0.09],
    ['3 oignons émincés', 'Oignons', 0.3],
    ['8 œufs', 'Œufs', 8],
    ['1 boîte de thon', 'Thon en boîte', 0.14],
    ['1 poulets coupé en 6 morceaux', 'Poulet entier', 1.5],
    ['4 blancs de poulet', 'Filets de poulet', 0.6],
    ['1 kg de pommes de terre', 'Pommes de terre', 1],
    ['20 cl de vin blanc', 'Vin', 0.2],
    ['1/2 citron', 'Citrons', 0.06],
    ['4 tortillas', 'Tortillas', 4],
    ['sel', 'Épices & condiments', 1],
  ];
  for (const [ligne, nom, qte] of cas) {
    const l = lireLigne(ligne);
    assert.strictEqual(l.nom, nom, ligne);
    assert.ok(Math.abs(l.qte - qte) < 1e-9, `${ligne} : ${l.qte} au lieu de ${qte}`);
  }
  assert.strictEqual(lireLigne('1 bouteille de sirop de grenadine').entree, null);
});

test('coût de recette : prix saisi à la main prioritaire, placard gratuit', () => {
  const t = tarifs([
    { nom: 'Pâtes', prix: 1.2, source: 'Open Prices Super U' },
    { nom: 'Pâtes', prix: 2, source: 'Saisi à la main' },
  ]);
  const a = analyserRecette({ portions: 2, ingredients: '500 g de pâtes\nsel' }, t);
  assert.strictEqual(a.cout, 1);
  assert.strictEqual(a.coutPortion, 0.5);
});

test('7 prochains jours : on ne propose rien pour un repas passé', () => {
  const c = creneauxAVenir(['midi', 'soir'], { date: '2026-11-03', heure: 15 });
  assert.strictEqual(c.length, 14);
  assert.deepStrictEqual(c[0], { date: '2026-11-03', moment: 'soir' });
  assert.deepStrictEqual(c[13], { date: '2026-11-10', moment: 'midi' });
  assert.deepStrictEqual(creneauxAVenir(['soir'], { date: '2026-11-03', heure: 22 })[0], { date: '2026-11-04', moment: 'soir' });
});

test('type de plat deviné', () => {
  assert.strictEqual(classer('Salade de pâtes au thon', 6), 'Midi simple');
  assert.strictEqual(classer('Wrap poulet crudités', 5), 'Midi simple');
  assert.strictEqual(classer('Chili con carne', 7, 'facile', 'plat-principal'), 'Plat du soir');
  assert.strictEqual(classer('Œufs brouillés', 2, 'très facile'), 'Les deux');
});

const produits = new Map(['Pâtes', 'Lardons', 'Riz', 'Jambon', 'Pain'].map((nom, i) => [nom, { ...PRODUITS.get(nom), prix: [2, 10, 2, 13, 1][i] }]));
const reglages = { budget: 60, periode: 'semaine', personnes: 1, repas: ['midi', 'soir'], restes: false };
const creneaux = creneauxAVenir(['midi', 'soir'], { date: '2026-11-02', heure: 8 });

test('planning : midi simple, soir cuisiné, variété, budget', () => {
  const recettes = [
    ...['m1', 'm2', 'm3', 'm4'].map((id) => ({ id, type: 'Midi simple', besoins: [{ nom: 'Pain', qte: 0.5 }, { nom: 'Jambon', qte: 0.05 }] })),
    ...['s1', 's2', 's3', 's4'].map((id) => ({ id, type: 'Plat du soir', besoins: [{ nom: 'Pâtes', qte: 0.1 }, { nom: 'Lardons', qte: 0.05 }] })),
  ];
  const plan = planifier({ recettes, produits, creneaux, reglages, hasard: () => 0.5 });
  assert.strictEqual(plan.repas.length, 14);
  for (const r of plan.repas) assert.strictEqual(r.recette[0], r.moment === 'midi' ? 'm' : 's');
  plan.repas.slice(1).forEach((r, i) => assert.notStrictEqual(r.recette, plan.repas[i].recette));
  plan.repas.slice(2).forEach((r, i) => assert.notStrictEqual(r.recette, plan.repas[i].recette, 'pas deux soirs de suite'));
  assert.ok(plan.total <= 60);
  // Achat par paquets : 7 × 100 g de pâtes = 700 g → 2 paquets de 500 g
  const pates = plan.achats.find((a) => a.nom === 'Pâtes');
  assert.strictEqual(pates.paquets, 2);
  assert.ok(Math.abs(pates.besoin - 0.7) < 1e-9);
  assert.strictEqual(pates.cout, 2 * 0.5 * 2);
});

test('planning : finit d’abord ce qui est au placard', () => {
  const recettes = [
    { id: 'lardons', type: 'Plat du soir', besoins: [{ nom: 'Lardons', qte: 0.1 }] },
    { id: 'riz', type: 'Plat du soir', besoins: [{ nom: 'Riz', qte: 0.1 }] },
  ];
  const stock = [{ nom: 'Lardons', quantite: 0.1, peremption: '2026-11-03' }];
  const soirs = creneaux.filter((c) => c.moment === 'soir').slice(0, 1);
  const plan = planifier({ recettes, produits, stock, creneaux: soirs, reglages, hasard: () => 0 });
  assert.strictEqual(plan.repas[0].recette, 'lardons');
  assert.strictEqual(plan.total, 0);
});

test('planning : restes du soir le lendemain midi', () => {
  const recettes = [
    { id: 'm', type: 'Midi simple', besoins: [{ nom: 'Pain', qte: 1 }] },
    { id: 's1', type: 'Plat du soir', besoins: [{ nom: 'Pâtes', qte: 0.1 }] },
    { id: 's2', type: 'Plat du soir', besoins: [{ nom: 'Riz', qte: 0.1 }] },
  ];
  const plan = planifier({ recettes, produits, creneaux, reglages: { ...reglages, restes: true }, hasard: () => 0.5 });
  const soir = plan.repas[1], midi = plan.repas[2];
  assert.strictEqual(soir.portions, 2);
  assert.ok(midi.restes && midi.recette === soir.recette && midi.cout === 0);

  // Absent le lendemain midi (chez les parents) : pas de cuisine en double.
  const sansMidi = creneaux.filter((c) => !(c.date === creneaux[2].date && c.moment === 'midi'));
  const plan2 = planifier({ recettes, produits, creneaux: sansMidi, reglages: { ...reglages, restes: true }, hasard: () => 0.5 });
  assert.strictEqual(plan2.repas[1].portions, 1);
  assert.ok(!plan2.repas[2].restes);
});

test('planning : repas gardés, mangé ailleurs, un seul repas changé', () => {
  const recettes = [
    ...['m1', 'm2', 'm3'].map((id) => ({ id, type: 'Midi simple', besoins: [{ nom: 'Pain', qte: 0.5 }] })),
    ...['s1', 's2', 's3'].map((id) => ({ id, type: 'Plat du soir', besoins: [{ nom: 'Pâtes', qte: 0.1 }] })),
  ];
  const k = (c) => cleCreneau(c.date, c.moment);
  const premier = planifier({ recettes, produits, creneaux, reglages, hasard: () => 0.5 });
  // On change le 2e repas, tous les autres restent ; le 3e est mangé ailleurs.
  const fixes = new Map(premier.repas.map((r) => [k(r), r]));
  const cible = premier.repas[1];
  fixes.delete(k(cible));
  fixes.set(k(premier.repas[2]), { ...premier.repas[2], ailleurs: true });
  const plan = planifier({ recettes, produits, creneaux, reglages, fixes, exclus: new Map([[k(cible), cible.recette]]), hasard: () => 0.5 });
  plan.repas.forEach((r, i) => {
    if (i === 1) assert.notStrictEqual(r.recette, cible.recette, 'le repas changé prend une autre recette');
    else assert.strictEqual(r.recette, premier.repas[i].recette, 'les autres ne bougent pas');
  });
  assert.ok(plan.repas[2].ailleurs && plan.repas[2].cout === 0);
  // Le repas mangé ailleurs n'est plus dans la liste : un paquet de pain de moins.
  const pain = (p) => p.achats.find((a) => a.nom === 'Pain').besoin;
  assert.ok(Math.abs(pain(premier) - pain(plan) - (premier.repas[2].moment === 'midi' ? 0.5 : 0)) < 1e-9);
});

test('cache Notion : une base n’est lue qu’une fois, les écritures le tiennent à jour', async () => {
  const appels = [];
  const lignes = [{ id: 'a', properties: { Nom: { type: 'title', title: [{ plain_text: 'Pâtes' }] } } }];
  const ancien = global.fetch;
  global.fetch = async (url, { method, body }) => {
    const chemin = url.replace('https://api.notion.com/v1', '');
    appels.push(`${method} ${chemin}`);
    const repondre = (data) => ({ ok: true, status: 200, headers: new Map(), json: async () => data });
    if (chemin.startsWith('/blocks/')) return repondre({ results: [{ type: 'child_database', id: 'base', child_database: { title: 'T' } }] });
    if (chemin === '/databases/base') return repondre({ properties: { Nom: { title: {} } } });
    if (chemin === '/databases/base/query') return repondre({ results: lignes, next_cursor: null });
    const nom = JSON.parse(body).properties?.Nom?.title?.[0]?.text.content;
    return repondre({ id: chemin === '/pages' ? 'b' : chemin.split('/')[2], properties: { Nom: { type: 'title', title: [{ plain_text: nom ?? '' }] } } });
  };
  process.env.NOTION_PAGE_ID = '0123456789abcdef0123456789abcdef';
  try {
    const SCHEMAS = { t: { titre: 'T', champs: { nom: ['Nom', 'title'] } } };
    const notion = require('./notion')(SCHEMAS, (col, o) => o, {});
    const [l1, l2] = await Promise.all([notion.list('t'), notion.list('t')]);
    assert.deepStrictEqual(l1, [{ id: 'a', nom: 'Pâtes' }]);
    assert.deepStrictEqual(l2, l1);
    await notion.add('t', { nom: 'Riz' });
    await notion.update('t', 'a', { nom: 'Pâtes complètes' });
    l1[0].nom = 'modifié par l’appelant'; // ne doit pas toucher le cache
    assert.deepStrictEqual(await notion.list('t'), [{ id: 'b', nom: 'Riz' }, { id: 'a', nom: 'Pâtes complètes' }]);
    await notion.remove('t', 'b');
    assert.deepStrictEqual(await notion.list('t'), [{ id: 'a', nom: 'Pâtes complètes' }]);
    assert.strictEqual(appels.filter((a) => a.endsWith('/query')).length, 1, appels.join('\n'));
  } finally {
    global.fetch = ancien;
    delete process.env.NOTION_PAGE_ID;
  }
});

test('placard : conserve entamée à finir vite', () => {
  const thon = PRODUITS.get('Thon en boîte');
  const lots = [{ nom: 'Thon en boîte', qte: 0.14, peremption: '2027-01-01' }];
  const { manque } = prendre(lots, thon, 0.07, '2026-11-02');
  assert.strictEqual(manque, 0);
  assert.ok(Math.abs(lots[0].qte - 0.07) < 1e-9);
  assert.strictEqual(lots[0].peremption, '2026-11-04');
});

test('lundi de la semaine', () => {
  assert.strictEqual(lundi('2026-11-03'), '2026-11-02');
  assert.strictEqual(lundi('2026-11-08'), '2026-11-02');
});

test('prix Open Prices : au kilo et filtrés par nom', () => {
  const pates = { cat: 'en:pastas', unite: 'kg', noms: ['pates', 'spaghetti'] };
  const items = [
    { currency: 'EUR', price: 1, product: { product_name: 'Spaghetti n°5', product_quantity: 500 } },
    { currency: 'EUR', price: 8, product: { product_name: 'Foie gras', product_quantity: 200 } },
  ];
  assert.deepStrictEqual(prixUnitaires(items, pates), [2]);
  const carottes = { tag: 'en:carrots', unite: 'kg' };
  assert.deepStrictEqual(prixUnitaires([{ currency: 'EUR', price: 1.5, price_per: 'KILOGRAM' }, { currency: 'EUR', price: 1, price_per: 'UNIT' }], carottes), [1.5]);
});

test('lecture d’une page de recette Marmiton', () => {
  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Poulet basquaise : la meilleure recette","recipeYield":"6 personnes","totalTime":"PT1H20M","recipeIngredient":["1 kg de tomates","sel"],"image":{"url":"https://img.example/p.jpg"},"recipeInstructions":[{"@type":"HowToStep","text":"Couper les  tomates."},{"@type":"HowToStep","text":"Cuire."}]}</script>
    <script>{"recipeType":"plat-principal","recipeDifficulty":"facile"}</script>`;
  const r = lireRecette(html, 'u');
  assert.deepStrictEqual(r, {
    nom: 'Poulet basquaise', url: 'u', portions: 6, temps: 80, ingredients: '1 kg de tomates\nsel',
    difficulte: 'facile', typeMarmiton: 'plat-principal', image: 'https://img.example/p.jpg', etapes: '1. Couper les tomates.\n2. Cuire.',
  });
});

test('recettes exclues : je n’aime pas, fruits de mer, pas de four', () => {
  const regl = { exclusions: 'omelette, soupe, fruits de mer', sansFour: true };
  const raisons = (nom, ingredients, etapes = '') => raisonsExclusion({ nom, etapes }, analyserRecette({ ingredients }, tarifs([])).lignes, regl);
  assert.deepStrictEqual(raisons('Omelette au fromage', '3 œufs'), ['omelette']);
  assert.deepStrictEqual(raisons('Soupe de légumes', '2 carottes'), ['soupe']);
  assert.deepStrictEqual(raisons('Poulet curry', '4 blancs de poulet\n2 cuillères à soupe de curry'), [], 'cuillère à soupe ne compte pas');
  assert.deepStrictEqual(raisons('Pâtes du marin', '200 g de crevettes\n300 g de pâtes'), ['fruits de mer']);
  assert.deepStrictEqual(raisons('Gratin de courgettes', '1 kg de courgettes'), ['four']);
  assert.deepStrictEqual(raisons('Poulet rôti du dimanche', '1 poulet', '1. Préchauffer le four à 200 °C.'), ['four']);
  assert.deepStrictEqual(raisons('Pâtes carbonara', '200 g de lardons', '1. Faire revenir les lardons à la poêle.'), []);
  assert.strictEqual(difficulteDe(3, '1. a\n2. b'), 'très facile');
  assert.strictEqual(difficulteDe(10, ''), 'moyenne');
  assert.strictEqual(difficulteLisible('tresfacile'), 'très facile');
  assert.deepStrictEqual(raisons('Hachis parmentier', '1 kg de pommes de terre'), ['four']);
});

test('synonymes choisis dans « À vérifier »', () => {
  assert.strictEqual(lireLigne('2 cuillères de sirop de grenadine').entree, null);
  definirSynonymes([{ nom: 'Sucre', synonymes: 'sirop de grenadine' }]);
  assert.strictEqual(lireLigne('2 cuillères de sirop de grenadine').nom, 'Sucre');
  definirSynonymes([]);
});

test('planning : une recette exclue n’est jamais proposée', () => {
  const recettes = [
    { id: 'four', type: 'Plat du soir', exclue: true, besoins: [{ nom: 'Riz', qte: 0.01 }] },
    { id: 'ok', type: 'Plat du soir', besoins: [{ nom: 'Pâtes', qte: 0.1 }] },
    { id: 'ok2', type: 'Plat du soir', besoins: [{ nom: 'Lardons', qte: 0.05 }] },
  ];
  const soirs = creneaux.filter((c) => c.moment === 'soir');
  const plan = planifier({ recettes, produits, creneaux: soirs, reglages, hasard: () => 0.5 });
  assert.ok(plan.repas.every((r) => r.recette !== 'four'));
});

test('planning : compléter un trou tient compte des repas déjà prévus après', () => {
  const recettes = ['a', 'b', 'c'].map((id) => ({ id, type: 'Plat du soir', besoins: [{ nom: 'Pâtes', qte: 0.1 }] }));
  const soirs = creneaux.filter((c) => c.moment === 'soir').slice(0, 4);
  // Soirs 2, 3 et 4 déjà décidés (a, b, a) : le soir 1 ne peut être ni a (déjà 2 fois) ni b (le lendemain).
  const fixes = new Map(soirs.slice(1).map((c, i) => [cleCreneau(c.date, c.moment), { recette: ['a', 'b', 'a'][i], portions: 1 }]));
  const plan = planifier({ recettes, produits, creneaux: soirs, reglages, fixes, hasard: () => 0.5 });
  assert.strictEqual(plan.repas[0].recette, 'c');
});

test('présence lue dans la base Notion « Présence » (Agendix)', () => {
  const lignes = [
    { note: 'Lieu par défaut', lieu: 'Angoulême', ordre: 1 },
    { du: '2026-11-20', duMoment: 'soir', au: '2026-11-22', auMoment: 'midi', lieu: 'Parents', ordre: 2 },
    { du: '2026-11-21', duMoment: 'soir', au: '2026-11-21', auMoment: 'soir', lieu: 'Ailleurs', ordre: 3 },
  ];
  const ou = (date, moment) => lieuDe(lignes, date, moment);
  assert.strictEqual(ou('2026-11-20', 'midi'), 'Angoulême'); // avant la borne
  assert.strictEqual(ou('2026-11-20', 'soir'), 'Parents'); // borne de début comprise
  assert.strictEqual(ou('2026-11-21', 'soir'), 'Ailleurs'); // la plus récente l'emporte
  assert.strictEqual(ou('2026-11-22', 'midi'), 'Parents'); // borne de fin comprise
  assert.strictEqual(ou('2026-11-22', 'soir'), 'Angoulême');
  assert.strictEqual(lieuDe([{ lieu: 'Parents', ordre: 1 }], '2026-11-25', 'midi'), 'Parents'); // lieu par défaut changé
  assert.strictEqual(lieuDe([], '2026-11-25', 'midi'), 'Angoulême'); // base vide ou absente
});

test('refresh Notion : relit à la demande, garde l’ancien contenu si la lecture échoue', async () => {
  let nom = 'Pâtes', panne = false, lectures = 0;
  const ancien = global.fetch;
  global.fetch = async (url) => {
    const chemin = url.replace('https://api.notion.com/v1', '');
    const repondre = (data, ok = true) => ({ ok, status: ok ? 200 : 400, headers: new Map(), json: async () => data });
    if (chemin.startsWith('/blocks/')) return repondre({ results: [{ type: 'child_database', id: 'base', child_database: { title: 'T' } }] });
    if (chemin === '/databases/base') return repondre({ properties: { Nom: { title: {} } } });
    lectures++;
    if (panne) return repondre({ message: 'panne Notion' }, false);
    return repondre({ results: [{ id: 'a', properties: { Nom: { type: 'title', title: [{ plain_text: nom }] } } }], next_cursor: null });
  };
  process.env.NOTION_PAGE_ID = '0123456789abcdef0123456789abcdef';
  try {
    const SCHEMAS = { t: { titre: 'T', champs: { nom: ['Nom', 'title'] } } };
    const notion = require('./notion')(SCHEMAS, (col, o) => o, {});
    assert.deepStrictEqual(await notion.list('t'), [{ id: 'a', nom: 'Pâtes' }]);
    nom = 'Riz'; // modifié dans Notion : le cache ne le voit pas encore
    assert.strictEqual((await notion.list('t'))[0].nom, 'Pâtes');
    assert.deepStrictEqual(await notion.rafraichir(['t']), { t: null });
    assert.strictEqual((await notion.list('t'))[0].nom, 'Riz');
    const avant = lectures;
    panne = true;
    nom = 'Semoule';
    assert.deepStrictEqual(await notion.rafraichir(['t']), { t: 'Notion : panne Notion' });
    assert.strictEqual((await notion.list('t'))[0].nom, 'Riz', 'ancien contenu gardé');
    assert.strictEqual(lectures, avant + 1, 'la liste suivante ne relit pas Notion');
  } finally {
    global.fetch = ancien;
    delete process.env.NOTION_PAGE_ID;
  }
});

test('écritures du planning : jamais deux repas sur un créneau, rien de supprimé ni recréé à tort', () => {
  const cle = (p) => cleCreneau(p.date, p.moment);
  const l = (id, date, moment, extra = {}) => ({ id, date, moment, recette: 'r' + id, garde: false, consomme: false, ...extra });
  // Notion : repas du 5 nov. midi, un repas déplacé à la main au 12 nov. soir (hors des 7 jours), un épinglé.
  const notion = [l('a', '2026-11-05', 'midi'), l('b', '2026-11-12', 'soir'), l('c', '2026-11-05', 'soir', { garde: true })];
  // L'appli ne gère que les 7 jours : 5 nov. midi (changé) et 5 nov. soir (épinglé, absent des lignes voulues).
  const gere = notion.filter((p) => p.date <= '2026-11-10');
  const voulues = [{ ...l('x', '2026-11-05', 'midi'), recette: 'autre' }, l('y', '2026-11-06', 'midi')];
  const ops = preparerEcritures(gere, voulues, cle);
  assert.deepStrictEqual(ops.modifs.map(([a]) => a.id), ['a'], 'modifié sur place');
  assert.deepStrictEqual(ops.ajouts.map((x) => x.id), ['y']);
  assert.deepStrictEqual(ops.retraits.map((a) => a.id), ['c']);
  const sur = verifierEcritures(ops, notion, cle);
  assert.deepStrictEqual(sur.retraits, [], 'un repas épinglé n’est jamais retiré');
  assert.ok(!sur.retraits.some((a) => a.id === 'b'), 'le repas déplacé hors des 7 jours n’est pas touché');
  assert.strictEqual(sur.ajouts.length, 1);

  // Entre-temps, dans Notion : un repas « Consommé » ou arrivé à la main occupe le créneau → pas d'ajout.
  assert.deepStrictEqual(verifierEcritures(ops, [...notion, l('z', '2026-11-06', 'midi', { consomme: true })], cle).ajouts, []);
  // Une ligne déplacée à la main entre la lecture et l'écriture n'est ni modifiée ni retirée.
  const deplacee = notion.map((p) => (p.id === 'a' ? { ...p, date: '2026-11-09' } : p));
  assert.deepStrictEqual(verifierEcritures(ops, deplacee, cle).modifs, []);
  const retiree = [...notion.filter((p) => p.id !== 'a')];
  assert.deepStrictEqual(verifierEcritures({ ajouts: [], modifs: [], retraits: [gere[0]] }, retiree, cle).retraits, []);
  // Une ligne identique ne génère aucune écriture.
  const ident = preparerEcritures(gere, gere.map((p) => ({ ...p })), cle);
  assert.deepStrictEqual([ident.ajouts, ident.modifs, ident.retraits], [[], [], []]);
});

test('présence : une ligne « Angoulême » n’est pas une absence', () => {
  const lignes = [{ du: '2026-11-06', duMoment: 'midi', au: '2026-11-06', auMoment: 'soir', lieu: 'Angoulême', ordre: 1 }];
  assert.strictEqual(lieuDe(lignes, '2026-11-06', 'midi'), 'Angoulême');
  assert.strictEqual(lieuDe(lignes, '2026-11-06', 'soir'), 'Angoulême');
});

// --- Widget iPhone : GET /api/widget/repas ------------------------------------------------------
// Le 5 novembre 2026 est en heure d'hiver : 13 h 59 à Paris = 12 h 59 UTC.
const A = (heure, jour = '2026-11-05') => new Date(`${jour}T${heure}:00+01:00`);
const instantaneWidget = (extra = {}) => ({
  quand: A('21:30', '2026-11-04'),
  planning: [
    { date: '2026-11-05', moment: 'midi', repas: 'Croque-monsieur et salade', recette: 'r1', cout: 1.756, restes: false, consomme: false, ailleurs: false },
    { date: '2026-11-05', moment: 'soir', repas: 'Poulet au curry et riz', recette: 'r2', cout: 3.55, restes: false, consomme: false, ailleurs: false },
    { date: '2026-11-06', moment: 'midi', repas: 'Pâtes', recette: 'r3', cout: 0.9, restes: false, consomme: false, ailleurs: false },
  ],
  courses: [],
  presence: [],
  recettes: new Map([
    ['r1', { nom: 'Croque-monsieur et salade', temps: 20, articles: ['Pain de mie', 'Jambon'] }],
    ['r2', { nom: 'Poulet au curry et riz', temps: 35, articles: ['Filets de poulet', 'Riz', 'Crème fraîche'] }],
    ['r3', { nom: 'Pâtes', temps: 10, articles: ['Pâtes', 'Pain'] }],
  ]),
  ...extra,
});

test('widget : date et heure ISO à Paris, avec le décalage', () => {
  assert.strictEqual(isoParis(new Date('2026-11-04T20:30:00Z')), '2026-11-04T21:30:00+01:00');
  assert.strictEqual(isoParis(new Date('2026-07-14T10:05:09Z')), '2026-07-14T12:05:09+02:00');
});

test('widget : le bon prochain repas à 13 h 59 et à 14 h 01', () => {
  const inst = instantaneWidget();
  const avant = construire(inst, A('13:59'));
  assert.deepStrictEqual(avant.next, { date: '2026-11-05', moment: 'midi', name: 'Croque-monsieur et salade', minutes: 20, cost: 1.76 });
  assert.deepStrictEqual(avant.after, { date: '2026-11-05', moment: 'soir', name: 'Poulet au curry et riz', minutes: 35, cost: 3.55 });
  const apres = construire(inst, A('14:01'));
  assert.strictEqual(apres.next.moment, 'soir');
  assert.strictEqual(apres.after.date, '2026-11-06');
  // Le soir reste le prochain jusqu'à 21 h, puis c'est le lendemain.
  assert.strictEqual(construire(inst, A('20:59')).next.moment, 'soir');
  assert.deepStrictEqual([construire(inst, A('21:01')).next.date, construire(inst, A('21:01')).after], ['2026-11-06', null]);
  assert.strictEqual(avant.updatedAt, '2026-11-04T21:30:00+01:00');
});

test('widget : un repas consommé, mangé ailleurs ou pendant une absence n\'est jamais le prochain', () => {
  const inst = instantaneWidget();
  inst.planning[0].consomme = true; // coché « Consommé » : on passe au suivant même avant 14 h
  assert.strictEqual(construire(inst, A('09:00')).next.moment, 'soir');
  inst.planning[1].ailleurs = true;
  assert.strictEqual(construire(inst, A('09:00')).next.date, '2026-11-06');
  // Absence « Parents » le 6 : ignoré ; une ligne « Angoulême » n'est pas une absence.
  const parents = { du: '2026-11-06', duMoment: 'midi', au: '2026-11-06', auMoment: 'soir', lieu: 'Parents', ordre: 1 };
  assert.strictEqual(construire(inst, A('09:00')).next.date, '2026-11-06');
  assert.strictEqual(construire({ ...inst, presence: [parents] }, A('09:00')).next, null);
  const angouleme = { ...parents, lieu: 'Angoulême' };
  assert.strictEqual(construire({ ...inst, presence: [angouleme] }, A('09:00')).next.date, '2026-11-06');
  // Rien de planifié.
  const vide = construire({ ...inst, planning: [] }, A('09:00'));
  assert.deepStrictEqual([vide.next, vide.after], [null, null]);
  assert.deepStrictEqual(vide.shopping, { toBuyCount: 0, urgentCount: 0, urgent: [] });
});

test('widget : courses à acheter et urgentes (aujourd\'hui ou demain, d\'après le planning réel)', () => {
  const inst = instantaneWidget({
    courses: [
      { article: 'Pain de mie', unite: 'kg', achete: false, pour: '2026-11-20' }, // « Pour le » périmé/faux : le planning dit le 5
      { article: 'Crème fraîche', unite: 'L', achete: false, pour: null },
      { article: 'Pain', unite: 'pièce', achete: false, pour: '2026-11-06' }, // r3, demain (le 6) à midi
      { article: 'Riz', unite: 'kg', achete: true, pour: '2026-11-05' }, // déjà acheté
      { article: 'Poivre', unite: 'placard', achete: false, pour: null }, // placard : ni compté ni urgent
      { article: 'Papier toilette', unite: null, achete: false, pour: null }, // article libre
    ],
  });
  const j = construire(inst, A('09:00'));
  assert.strictEqual(j.shopping.toBuyCount, 4);
  assert.deepStrictEqual(j.shopping.urgent, [
    { name: 'Crème fraîche', neededOn: '2026-11-05' },
    { name: 'Pain de mie', neededOn: '2026-11-05' },
    { name: 'Pain', neededOn: '2026-11-06' },
  ]);
  assert.strictEqual(j.shopping.urgentCount, 3);
  // Un article nécessaire dans 5 jours n'est pas urgent ; 3 éléments au plus dans « urgent ».
  inst.planning.push({ date: '2026-11-10', moment: 'soir', repas: 'Quiche', recette: 'r4', cout: 2, restes: false, consomme: false, ailleurs: false });
  inst.recettes.set('r4', { nom: 'Quiche', temps: 40, articles: ['Œufs'] });
  inst.courses.push({ article: 'Œufs', unite: 'pièce', achete: false, pour: '2026-11-10' });
  const k = construire(inst, A('09:00')).shopping;
  assert.strictEqual(k.toBuyCount, 5);
  assert.ok(!k.urgent.some((x) => x.name === 'Œufs'));
  inst.courses.push({ article: 'Jambon', unite: 'kg', achete: false, pour: null });
  const l = construire(inst, A('09:00')).shopping;
  assert.deepStrictEqual([l.urgentCount, l.urgent.length], [4, 3]);
  // Plus de repas ce soir-là : « Crème fraîche » (poulet du 5 au soir) n'est plus pour aujourd'hui une fois le repas passé.
  assert.ok(!construire(inst, A('22:00')).shopping.urgent.some((x) => x.name === 'Crème fraîche'));
});

test('widget : jeton obligatoire, cache vide, réponse correcte, débit limité', async () => {
  const express = require('express');
  const JETON = 'x'.repeat(40);
  let inst = null;
  const app = express();
  app.get('/api/widget/repas', routeWidget({ jeton: JETON, instantane: () => inst, parHeure: 3, echecsParHeure: 2 }));
  const serveur = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${serveur.address().port}/api/widget/repas`;
  const appel = (jeton) => fetch(url, jeton ? { headers: { Authorization: `Bearer ${jeton}` } } : {});
  try {
    let r = await appel(null); // jeton absent
    assert.strictEqual(r.status, 401);
    assert.strictEqual(await r.text(), '');
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
    r = await appel('y'.repeat(40)); // jeton faux
    assert.strictEqual(r.status, 401);
    assert.strictEqual(await r.text(), '');
    r = await appel(JETON); // cache vide : pas encore d'instantané
    assert.strictEqual(r.status, 503);
    inst = instantaneWidget();
    r = await appel(JETON);
    assert.strictEqual(r.status, 200);
    r = await appel(JETON); // 3e requête valide de l'heure (limite fixée à 3 dans ce test) : encore permise
    assert.strictEqual(r.status, 200);
    r = await appel(JETON); // 4e : refusée
    assert.strictEqual(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  } finally { serveur.close(); }

  // Forme exacte de la réponse (noms de champs du brief).
  const app2 = express();
  const JSON_OK = instantaneWidget();
  app2.get('/w', routeWidget({ jeton: JETON, instantane: () => JSON_OK }));
  const s2 = await new Promise((ok) => { const s = app2.listen(0, '127.0.0.1', () => ok(s)); });
  try {
    const r = await fetch(`http://127.0.0.1:${s2.address().port}/w`, { headers: { Authorization: `Bearer ${JETON}` } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
    const corps = await r.json();
    assert.deepStrictEqual(Object.keys(corps), ['updatedAt', 'next', 'after', 'shopping']);
    assert.deepStrictEqual(Object.keys(corps.shopping), ['toBuyCount', 'urgentCount', 'urgent']);
    assert.deepStrictEqual(Object.keys(corps.next), ['date', 'moment', 'name', 'minutes', 'cost']);
  } finally { s2.close(); }

  // Trop d'essais ratés depuis la même adresse : 429. Jeton non configuré (ou trop court) : route désactivée.
  const reglee = routeWidget({ jeton: JETON, instantane: () => null, echecsParHeure: 2 });
  const faux = () => { const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, set(k, v) { this.h[k] = v; return this; }, end() { return this; }, json() { return this; } }; reglee({ headers: {}, ip: '1.2.3.4' }, res); return res.code; };
  assert.deepStrictEqual([faux(), faux(), faux()], [401, 401, 429]);
  const coupee = (jeton) => { let code; routeWidget({ jeton, instantane: () => null })({ headers: { authorization: 'Bearer abc' }, ip: 'x' }, { setHeader() {}, status(c) { code = c; return this; }, end() {} }); return code; };
  assert.deepStrictEqual([coupee(undefined), coupee('court')], [404, 404]);
  assert.strictEqual(limiteur(1, 1000)('a', 0), 0);
});
