// Vérifications rapides : npm test
const test = require('node:test');
const assert = require('node:assert');
const { lireLigne, tarifs, analyserRecette, PRODUITS } = require('./ingredients');
const { planifier, prendre, classer, creneauxAVenir, lundi, lieuDe, cleCreneau } = require('./planning');
const { prixUnitaires } = require('./prix');
const { lireRecette } = require('./marmiton');

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
  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Poulet basquaise : la meilleure recette","recipeYield":"6 personnes","totalTime":"PT1H20M","recipeIngredient":["1 kg de tomates","sel"]}</script>
    <script>{"recipeType":"plat-principal","recipeDifficulty":"facile"}</script>`;
  const r = lireRecette(html, 'u');
  assert.deepStrictEqual(r, {
    nom: 'Poulet basquaise', url: 'u', portions: 6, temps: 80, ingredients: '1 kg de tomates\nsel',
    difficulte: 'facile', typeMarmiton: 'plat-principal',
  });
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
