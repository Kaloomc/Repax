const express = require('express');
const path = require('path');
const store = require('./store');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/etat', (req, res) => {
  res.json({ mode: store.mode });
});

app.get('/api/reglages', (req, res) => {
  res.json(store.get('reglages'));
});

app.put('/api/reglages', (req, res) => {
  const { budget, periode, personnes, repas } = req.body ?? {};
  const ok =
    Number.isFinite(budget) && budget >= 0 && budget <= 10000 &&
    ['semaine', 'mois'].includes(periode) &&
    Number.isInteger(personnes) && personnes >= 1 && personnes <= 20 &&
    Array.isArray(repas) && repas.length > 0 && repas.every((r) => ['midi', 'soir'].includes(r));
  if (!ok) return res.status(400).json({ erreur: 'Réglages invalides' });
  res.json(store.set('reglages', { budget, periode, personnes, repas: [...new Set(repas)] }));
});

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
  console.log(`Gestion des repas sur http://localhost:${PORT} (mode ${store.mode})`);
});
