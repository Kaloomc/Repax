// Stockage des données : Notion si NOTION_TOKEN est défini, sinon mode démo
// (fichier data/demo.json, ignoré par Git).
// Les deux modes offrent les mêmes fonctions : list, add, update, remove.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Les 6 bases de Repax, puis celles d'Agendix et d'Argenx. clé JS → [nom de la colonne Notion, type Notion, base liée]
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
      type: ['Type de repas', 'select'], difficulte: ['Difficulté', 'select'],
    },
  },
  planning: {
    titre: 'Planning des repas',
    champs: {
      repas: ['Repas', 'title'], date: ['Date', 'date'], moment: ['Moment', 'select'],
      recette: ['Recette', 'relation', 'recettes'], cout: ['Coût estimé', 'number'],
      portions: ['Portions cuisinées', 'number'], restes: ['Restes', 'checkbox'], consomme: ['Consommé', 'checkbox'],
      garde: ['Gardé', 'checkbox'], ailleurs: ['Mangé ailleurs', 'checkbox'],
    },
  },
  courses: {
    titre: 'Liste de courses',
    champs: {
      article: ['Article', 'title'], paquets: ['Paquets', 'number'], quantite: ['Quantité', 'number'], besoin: ['Besoin', 'number'],
      unite: ['Unité', 'select'], produit: ['Produit', 'relation', 'produits'], cout: ['Coût estimé', 'number'],
      achete: ['Acheté', 'checkbox'], pour: ['Pour le', 'date'], source: ['Source du prix', 'select'],
    },
  },
  stock: {
    titre: 'Garde-manger',
    champs: {
      nom: ['Produit', 'title'], quantite: ['Quantité', 'number'], unite: ['Unité', 'select'],
      achat: ['Acheté le', 'date'], peremption: ['À finir avant', 'date'], origine: ['Origine', 'rich_text'],
    },
  },
  depenses: {
    titre: 'Budget & dépenses',
    champs: {
      libelle: ['Libellé', 'title'], type: ['Type', 'select'], montant: ['Montant', 'number'], date: ['Date', 'date'],
      periode: ['Période', 'select'], magasin: ['Magasin', 'rich_text'], personnes: ['Personnes', 'number'],
      repas: ['Repas', 'multi_select'], restes: ['Restes le midi', 'checkbox'],
    },
  },
  // Bases des autres applis, dans la même page Notion : lues seulement, jamais créées ni modifiées ici.
  presence: {
    titre: 'Présence', externe: true, // remplie par Agendix
    champs: {
      note: ['Note', 'title'], du: ['Du', 'date'], duMoment: ['Moment de début', 'select'],
      au: ['Au', 'date'], auMoment: ['Moment de fin', 'select'], lieu: ['Lieu', 'select'], ordre: ['Ordre', 'number'],
    },
  },
  coursesPayees: {
    titre: 'Courses payées', externe: true, // remplie par Argenx (relevé Revolut, catégorie Courses)
    champs: { libelle: ['Libellé', 'title'], date: ['Date', 'date'], montant: ['Montant', 'number'] },
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
    db = { recettes: [] };
  }
  const save = () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  };
  // Mise à niveau d'un ancien fichier : nouvelles bases, nouvelles recettes d'exemple, type des anciennes.
  for (const c of Object.keys(SCHEMAS)) db[c] ??= [];
  if ((db.version ?? 1) < 2) {
    for (const r of recettesDemo) {
      const existante = db.recettes.find((x) => x.nom === r.nom);
      if (existante) existante.type ??= r.type;
      else db.recettes.push({ id: crypto.randomUUID(), ...r });
    }
    db.version = 2;
    save();
  }
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
module.exports.SCHEMAS = SCHEMAS;
