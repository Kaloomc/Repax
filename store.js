// Stockage des données.
// Mode démo : tout est gardé dans data/demo.json (ignoré par Git).
// Le mode Notion arrivera à l'étape 6, avec les mêmes fonctions get/set.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'demo.json');

const DEFAULTS = {
  reglages: { budget: 60, periode: 'semaine', personnes: 1, repas: ['midi', 'soir'] },
  produits: [],
  recettes: [],
  planning: [],
  courses: [],
  depenses: [],
};

let db;
try {
  db = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch {
  db = structuredClone(DEFAULTS);
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

module.exports = {
  mode: 'demo',
  get: (cle) => db[cle],
  set: (cle, valeur) => {
    db[cle] = valeur;
    save();
    return valeur;
  },
};
