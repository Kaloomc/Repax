// Vérifications rapides : npm test
const test = require('node:test');
const assert = require('node:assert');
const { lireLigne, tarifs, analyserRecette } = require('./ingredients');
const { planifier, lundi } = require('./planning');
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

test('planning : budget, variété, pas deux fois de suite', () => {
  const recettes = Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i, coutPortion: 1 + i * 0.5, ingredients: new Set(['Pâtes']) }));
  const reglages = { budget: 40, periode: 'semaine', personnes: 1, repas: ['midi', 'soir'] };
  const { repas, cout } = planifier({ recettes, reglages, semaine: '2026-11-02', hasard: () => 0.5 });
  assert.strictEqual(repas.length, 14);
  assert.ok(cout <= 40, `coût ${cout}`);
  const compte = {};
  repas.forEach((r, i) => {
    compte[r.recette] = (compte[r.recette] || 0) + 1;
    if (i) assert.notStrictEqual(r.recette, repas[i - 1].recette);
  });
  assert.ok(Object.values(compte).every((n) => n <= 2));
  assert.strictEqual(repas[13].date, '2026-11-08');
});

test('lundi de la semaine', () => {
  assert.strictEqual(lundi('2026-11-03'), '2026-11-02');
  assert.strictEqual(lundi('2026-11-08'), '2026-11-02');
  assert.strictEqual(lundi('2026-11-02'), '2026-11-02');
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
  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Poulet basquaise : la meilleure recette","recipeYield":"6 personnes","totalTime":"PT1H20M","recipeIngredient":["1 kg de tomates","sel"]}</script>`;
  const r = lireRecette(html, 'u');
  assert.deepStrictEqual(r, { nom: 'Poulet basquaise', url: 'u', portions: 6, temps: 80, ingredients: '1 kg de tomates\nsel' });
});
