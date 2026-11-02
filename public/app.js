const api = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erreur || 'Erreur serveur');
  return data;
};

// Onglets : la partie après # dans l'adresse choisit la section affichée.
function afficherOnglet() {
  const id = location.hash.slice(1) || 'semaine';
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.hash === '#' + id));
}
addEventListener('hashchange', afficherOnglet);
afficherOnglet();

// Réglages
const form = document.getElementById('form-reglages');
const message = document.getElementById('message');

async function chargerReglages() {
  const r = await api('/api/reglages');
  form.budget.value = r.budget;
  form.periode.value = r.periode;
  form.personnes.value = r.personnes;
  form.querySelectorAll('[name=repas]').forEach((c) => (c.checked = r.repas.includes(c.value)));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const repas = [...form.querySelectorAll('[name=repas]:checked')].map((c) => c.value);
  if (!repas.length) return (message.textContent = 'Coche au moins un repas.');
  try {
    await api('/api/reglages', {
      method: 'PUT',
      body: {
        budget: Number(form.budget.value),
        periode: form.periode.value,
        personnes: Number(form.personnes.value),
        repas,
      },
    });
    message.textContent = 'Réglages enregistrés ✔';
  } catch (err) {
    message.textContent = err.message;
  }
});

api('/api/etat').then((e) => (document.getElementById('mode').hidden = e.mode !== 'demo'));
chargerReglages();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
