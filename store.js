// Stockage des données : Notion si NOTION_TOKEN est défini, sinon mode démo
// (fichier data/demo.json, ignoré par Git).
// Les deux modes offrent les mêmes fonctions : list, add, update, remove.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Les 5 bases. clé JS → [nom de la colonne Notion, type Notion, base liée]
// L'ordre compte : une base liée doit être créée avant celle qui la référence.
const SCHEMAS = {
  produits: {
    titre: 'Produits & prix',
    champs: {
      nom: ['Nom', 'title'], categorie: ['Catégorie', 'select'], prix: ['Prix', 'number'],
      unite: ['Unité', 'select'], source: ['Source du prix', 'select'], datePrix: ['Date du prix', 'date'],
    },
  },
  recettes: {
    titre: 'Recettes',
    champs: {
      nom: ['Nom', 'title'], url: ['Lien Marmiton', 'url'], portions: ['Portions', 'number'],
      ingredients: ['Ingrédients', 'rich_text'], temps: ['Temps (min)', 'number'], cout: ['Coût estimé', 'number'],
      coutPortion: ['Coût par portion', 'number'], dateRecup: ['Date de récupération', 'date'],
    },
  },
  planning: {
    titre: 'Planning des repas',
    champs: {
      repas: ['Repas', 'title'], date: ['Date', 'date'], moment: ['Moment', 'select'],
      recette: ['Recette', 'relation', 'recettes'], semaine: ['Semaine', 'rich_text'], cout: ['Coût estimé', 'number'],
    },
  },
  courses: {
    titre: 'Liste de courses',
    champs: {
      article: ['Article', 'title'], quantite: ['Quantité', 'number'], unite: ['Unité', 'select'],
      produit: ['Produit', 'relation', 'produits'], cout: ['Coût estimé', 'number'], achete: ['Acheté', 'checkbox'],
      semaine: ['Semaine', 'rich_text'], source: ['Source du prix', 'select'],
    },
  },
  depenses: {
    titre: 'Budget & dépenses',
    champs: {
      libelle: ['Libellé', 'title'], type: ['Type', 'select'], montant: ['Montant', 'number'], date: ['Date', 'date'],
      periode: ['Période', 'select'], magasin: ['Magasin', 'rich_text'], personnes: ['Personnes', 'number'], repas: ['Repas', 'multi_select'],
    },
  },
};

// Garde seulement les champs connus du schéma.
const nettoyer = (col, obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => k in SCHEMAS[col].champs));

const recettesDemo = require('./demo-recettes.json');

function demo() {
  const FILE = path.join(__dirname, 'data', 'demo.json');
  let db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    db = Object.fromEntries(Object.keys(SCHEMAS).map((c) => [c, []]));
    db.recettes = recettesDemo.map((r) => ({ id: crypto.randomUUID(), ...r }));
  }
  const save = () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  };
  return {
    mode: 'demo',
    list: async (col) => structuredClone(db[col]),
    add: async (col, obj) => {
      const ligne = { id: crypto.randomUUID(), ...nettoyer(col, obj) };
      db[col].push(ligne);
      save();
      return ligne;
    },
    update: async (col, id, patch) => {
      const ligne = db[col].find((x) => x.id === id);
      if (!ligne) throw new Error('Introuvable');
      Object.assign(ligne, nettoyer(col, patch));
      save();
      return ligne;
    },
    remove: async (col, id) => {
      db[col] = db[col].filter((x) => x.id !== id);
      save();
    },
  };
}

module.exports = process.env.NOTION_TOKEN
  ? require('./notion')(SCHEMAS, nettoyer, { recettes: recettesDemo })
  : demo();
