// --- Outils ------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const euros = (n) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const dateDans = (jours) => new Date(Date.now() + jours * 864e5).toLocaleDateString('sv-SE');

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/connexion')) location.hash = '#connexion';
  if (!res.ok) throw new Error(data.erreur || 'Erreur serveur');
  return data;
}

const BADGES = {
  'Open Prices Super U': ['Super U', 'ok'],
  'Open Prices autre magasin': ['autre magasin', 'moyen'],
  'Estimation par catégorie': ['estimé', 'estime'],
  'Saisi à la main': ['mon prix', 'manuel'],
};
const badge = (source) => {
  const [texte, classe] = BADGES[source] || ['?', 'estime'];
  return `<span class="pastille ${classe}">${texte}</span>`;
};

const barre = (valeur, max) => {
  const pc = max > 0 ? Math.min(100, (valeur / max) * 100) : 100;
  return `<div class="barre"><div style="width:${pc}%" class="${valeur > max ? 'depasse' : ''}"></div></div>`;
};

function quantite(q, unite) {
  if (unite === 'kg') return q < 1 ? `${Math.max(1, Math.round(q * 1000))} g` : `${q.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
  if (unite === 'L') return q < 1 ? `${Math.max(1, Math.round(q * 100))} cl` : `${q.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;
  if (unite === 'pièce') return `× ${Math.ceil(q - 1e-9)}`;
  return '';
}

// Affiche un message dans le <p class="message"> le plus proche.
const dire = (el, texte) => {
  const p = el.querySelector('.message') || el;
  p.textContent = texte;
};

// --- Onglets -----------------------------------------------------------------
const CHARGER = {
  semaine: () => chargerSemaine(),
  courses: () => chargerSemaine(),
  recettes: () => chargerRecettes(),
  prix: () => chargerPrix(),
  budget: () => chargerBudget(),
};

function afficherOnglet() {
  const id = location.hash.slice(1) || 'semaine';
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.hash === '#' + id));
  CHARGER[id]?.().catch((err) => console.error(err));
}
addEventListener('hashchange', afficherOnglet);

// --- Connexion ---------------------------------------------------------------
$('#form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/connexion', { method: 'POST', body: { motDePasse: e.target.motDePasse.value } });
    location.hash = '#semaine';
  } catch (err) {
    dire(e.target, err.message);
  }
});

// --- Semaine & courses -------------------------------------------------------
let decalage = 0; // 0 = cette semaine, 7 = la suivante
let donneesSemaine;

$('#choix-semaine').addEventListener('change', (e) => {
  decalage = Number(e.target.value);
  chargerSemaine();
});

async function chargerSemaine() {
  donneesSemaine = await api(`/api/semaine?debut=${dateDans(decalage)}`);
  afficherSemaine();
  afficherCourses();
}

function afficherSemaine() {
  const s = donneesSemaine;
  $('#resume-semaine').innerHTML = `
    <div class="chiffres">
      <div><small>Du ${jourCourt(s.debut)} au ${jourCourt(s.fin)}</small><strong>${euros(s.total)}</strong><small>estimés</small></div>
      <div><small>Budget semaine</small><strong>${euros(s.budget)}</strong><small class="${s.total > s.budget ? 'rouge' : 'vert'}">${s.total > s.budget ? 'dépassé de ' + euros(s.total - s.budget) : 'reste ' + euros(s.budget - s.total)}</small></div>
    </div>
    ${barre(s.total, s.budget)}`;
  $('#proposer').textContent = s.repas.length ? '🔁 Proposer d’autres repas' : '✨ Proposer les repas';

  if (!s.repas.length) {
    $('#jours').innerHTML = '<p class="vide">Pas encore de repas prévus pour cette semaine.</p>';
    return;
  }
  const parJour = Object.groupBy(s.repas, (r) => r.date);
  $('#jours').innerHTML = Object.entries(parJour).map(([date, repas]) => `
    <div class="jour carte">
      <h3>${jourLong(date)}</h3>
      ${repas.map((r) => `
        <div class="repas">
          <span class="moment">${r.moment}</span>
          <span class="nom">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.repas)}</a>` : esc(r.repas)}${r.supprimee ? ' <small>(recette supprimée)</small>' : ''}</span>
          <span class="cout">${euros(r.cout)}</span>
        </div>`).join('')}
    </div>`).join('');
}

$('#proposer').addEventListener('click', async (e) => {
  if (donneesSemaine?.repas.length && !confirm('Remplacer les repas de cette semaine ? Les articles déjà cochés restent cochés.')) return;
  const bouton = e.target;
  bouton.disabled = true;
  dire($('#message-semaine'), modeNotion ? 'Je choisis les repas et je les range dans Notion (20 à 30 secondes)…' : 'Je choisis les repas…');
  try {
    donneesSemaine = await api('/api/semaine', { method: 'POST', body: { debut: dateDans(decalage) } });
    afficherSemaine();
    afficherCourses();
    dire($('#message-semaine'), '');
  } catch (err) {
    dire($('#message-semaine'), err.message);
  } finally {
    bouton.disabled = false;
  }
});

function afficherCourses() {
  const s = donneesSemaine;
  $('#resume-courses').innerHTML = `
    <div class="chiffres">
      <div><small>Total estimé</small><strong>${euros(s.total)}</strong></div>
      <div><small>Reste à acheter</small><strong>${euros(s.resteAAcheter)}</strong></div>
      <div><small>Budget</small><strong>${euros(s.budget)}</strong></div>
    </div>
    ${barre(s.total, s.budget)}
    <p class="aide">Du ${jourCourt(s.debut)} au ${jourCourt(s.fin)}. Les pastilles indiquent d'où vient chaque prix.</p>`;
  if (!s.courses.length) {
    $('#liste-courses').innerHTML = '<p class="vide">La liste se remplit quand tu proposes les repas de la semaine.</p>';
    return;
  }
  const rayons = Object.groupBy(s.courses, (c) => c.rayon);
  const ordre = Object.keys(rayons).sort((a, b) => (a === 'Placard') - (b === 'Placard') || a.localeCompare(b, 'fr'));
  $('#liste-courses').innerHTML = ordre.map((rayon) => `
    <h3>${esc(rayon === 'Placard' ? 'Placard (déjà à la maison ?)' : rayon)}</h3>
    <ul class="liste">
      ${rayons[rayon].map((c) => `
        <li class="${c.achete ? 'achete' : ''}">
          <label class="case">
            <input type="checkbox" data-id="${esc(c.id)}" ${c.achete ? 'checked' : ''}>
            <span class="nom">${esc(c.article)} <small>${quantite(c.quantite, c.unite)}</small></span>
          </label>
          ${c.rayon === 'Placard' ? '' : `<span class="cout">${euros(c.cout)}</span> ${badge(c.source)}`}
        </li>`).join('')}
    </ul>`).join('');
}

$('#liste-courses').addEventListener('change', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  const article = donneesSemaine.courses.find((c) => c.id === id);
  article.achete = e.target.checked;
  donneesSemaine.resteAAcheter = donneesSemaine.courses.filter((c) => !c.achete).reduce((s, c) => s + (c.cout || 0), 0);
  afficherCourses();
  try {
    await api(`/api/courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: { achete: article.achete } });
  } catch (err) {
    alert(err.message);
    chargerSemaine();
  }
});

// --- Recettes ----------------------------------------------------------------
async function chargerRecettes() {
  const recettes = await api('/api/recettes');
  $('#mes-recettes').innerHTML = recettes.length ? recettes.map((r) => `
    <li class="recette">
      <details>
        <summary>
          <span class="nom">${esc(r.nom)}</span>
          <span class="cout">${euros(r.coutPortion)}<small>/portion</small></span>
          ${r.estime ? '<span class="pastille estime">prix estimés</span>' : ''}
        </summary>
        <p class="aide">${r.portions} portions${r.temps ? ` · ${r.temps} min` : ''} · total ${euros(r.cout)}
          ${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">voir sur Marmiton</a>` : ' · recette d’exemple'}</p>
        <ul class="ingredients">
          ${r.lignes.map((l) => `<li><span>${esc(l.brut)}</span>${l.placard ? '<small>placard</small>' : `<span>${euros(l.cout)} ${l.inconnu ? '<span class="pastille estime">non reconnu</span>' : badge(l.source)}</span>`}</li>`).join('')}
        </ul>
        <button class="secondaire" data-supprimer="${esc(r.id)}">Supprimer la recette</button>
      </details>
    </li>`).join('') : '<p class="vide">Aucune recette. Cherche sur Marmiton ci-dessus.</p>';
}

$('#mes-recettes').addEventListener('click', async (e) => {
  const id = e.target.dataset.supprimer;
  if (!id || !confirm('Supprimer cette recette ?')) return;
  await api(`/api/recettes/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((err) => alert(err.message));
  chargerRecettes();
});

async function ajouterRecette(url, form) {
  dire(form, 'Récupération de la recette sur Marmiton…');
  try {
    const r = await api('/api/recettes', { method: 'POST', body: { url } });
    dire(form, r.deja ? `« ${r.nom} » est déjà dans tes recettes.` : `« ${r.nom} » ajoutée ✔`);
    chargerRecettes();
    return true;
  } catch (err) {
    dire(form, err.message);
  }
}

$('#form-marmiton').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const q = form.q.value.trim();
  if (/^https?:\/\//.test(q)) return ajouterRecette(q, form);
  dire(form, 'Recherche sur Marmiton…');
  try {
    const resultats = await api(`/api/marmiton?q=${encodeURIComponent(q)}`);
    dire(form, resultats.length ? '' : 'Aucun résultat.');
    $('#resultats').innerHTML = resultats.map((r) => `
      <li>
        <a href="${esc(r.url)}" target="_blank" rel="noopener" class="nom">${esc(r.titre)}</a>
        ${r.deja ? '<small>✔ ajoutée</small>' : `<button class="petit" data-url="${esc(r.url)}">Ajouter</button>`}
      </li>`).join('');
  } catch (err) {
    dire(form, err.message);
  }
});

$('#resultats').addEventListener('click', async (e) => {
  const url = e.target.dataset.url;
  if (!url) return;
  e.preventDefault();
  e.target.disabled = true;
  if (await ajouterRecette(url, $('#form-marmiton'))) e.target.outerHTML = '<small>✔ ajoutée</small>';
  else e.target.disabled = false;
});

// --- Prix --------------------------------------------------------------------
let suiviPrix;

async function chargerPrix() {
  const { liste, etat } = await api('/api/prix');
  const rayons = Object.groupBy(liste, (p) => p.rayon);
  $('#liste-prix').innerHTML = Object.entries(rayons).map(([rayon, produits]) => `
    <li class="titre-rayon">${esc(rayon)}</li>
    ${produits.map((p) => `
      <li>
        <button class="lien nom" data-nom="${esc(p.nom)}" data-unite="${esc(p.unite)}" data-manuel="${p.source === 'Saisi à la main'}">${esc(p.nom)}</button>
        <span class="cout">${euros(p.prix)}<small>/${esc(p.unite)}</small></span>
        ${badge(p.source)}
      </li>`).join('')}`).join('');

  const e = $('#etat-prix');
  if (etat.enCours) {
    e.textContent = `Actualisation en cours : ${etat.fait} / ${etat.total} produits…`;
    clearTimeout(suiviPrix);
    suiviPrix = setTimeout(() => location.hash === '#prix' && chargerPrix(), 2000);
  } else if (etat.erreur) e.textContent = `Erreur : ${etat.erreur}`;
  else if (etat.fin) e.textContent = `Dernière actualisation : ${new Date(etat.fin).toLocaleString('fr-FR')}`;
  $('#actualiser').disabled = etat.enCours;
}

$('#actualiser').addEventListener('click', async () => {
  await api('/api/prix/actualiser', { method: 'POST' });
  chargerPrix();
});

$('#liste-prix').addEventListener('click', async (e) => {
  const { nom, unite, manuel } = e.target.dataset;
  if (!nom) return;
  const reponse = prompt(`Ton prix pour « ${nom} » (en € par ${unite}).${manuel === 'true' ? '\nLaisse vide pour revenir au prix automatique.' : ''}`);
  if (reponse === null) return;
  const valeur = reponse.trim() === '' ? null : Number(reponse.replace(',', '.'));
  try {
    await api(`/api/prix/${encodeURIComponent(nom)}`, { method: 'PUT', body: { prix: valeur } });
    chargerPrix();
  } catch (err) {
    alert(err.message);
  }
});

// --- Budget ------------------------------------------------------------------
async function chargerBudget() {
  const b = await api('/api/budget');
  $('#resume-budget').innerHTML = `
    <div class="chiffres">
      <div><small>Budget ${b.periode === 'mois' ? 'du mois' : 'de la semaine'}</small><strong>${euros(b.budget)}</strong></div>
      <div><small>Dépensé</small><strong>${euros(b.depense)}</strong></div>
      <div><small>Reste</small><strong class="${b.reste < 0 ? 'rouge' : 'vert'}">${euros(b.reste)}</strong></div>
    </div>
    ${barre(b.depense, b.budget)}
    <p class="aide">Du ${jourCourt(b.debut)} au ${jourCourt(b.fin)}.</p>`;
  $('#liste-depenses').innerHTML = b.depenses.map((d) => `
    <li>
      <span class="nom">${esc(d.libelle)} <small>${jourCourt(d.date)}${d.magasin ? ' · ' + esc(d.magasin) : ''}</small></span>
      <span class="cout">${euros(d.montant)}</span>
      <button class="petit secondaire" data-supprimer="${esc(d.id)}" aria-label="Supprimer">✕</button>
    </li>`).join('');

  const f = $('#form-reglages');
  f.budget.value = b.budget;
  f.periode.value = b.periode;
  f.personnes.value = b.personnes;
  f.querySelectorAll('[name=repas]').forEach((c) => (c.checked = b.repas.includes(c.value)));
  const d = $('#form-depense');
  if (!d.date.value) d.date.value = dateDans(0);
}

$('#form-depense').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/depenses', {
      method: 'POST',
      body: { montant: Number(f.montant.value), libelle: f.libelle.value, date: f.date.value, magasin: f.magasin.value },
    });
    f.montant.value = '';
    dire(f, 'Dépense enregistrée ✔');
    chargerBudget();
  } catch (err) {
    dire(f, err.message);
  }
});

$('#liste-depenses').addEventListener('click', async (e) => {
  const id = e.target.dataset.supprimer;
  if (!id || !confirm('Supprimer cette dépense ?')) return;
  await api(`/api/depenses/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((err) => alert(err.message));
  chargerBudget();
});

$('#form-reglages').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const repas = [...f.querySelectorAll('[name=repas]:checked')].map((c) => c.value);
  if (!repas.length) return dire(f, 'Coche au moins un repas.');
  try {
    await api('/api/reglages', {
      method: 'PUT',
      body: { budget: Number(f.budget.value), periode: f.periode.value, personnes: Number(f.personnes.value), repas },
    });
    dire(f, 'Réglages enregistrés ✔ Repropose les repas pour en tenir compte.');
    chargerBudget();
  } catch (err) {
    dire(f, err.message);
  }
});

// --- Démarrage ---------------------------------------------------------------
let modeNotion = false;
api('/api/etat').then((e) => {
  $('#mode').hidden = e.mode !== 'demo';
  modeNotion = e.mode === 'notion';
}).catch(() => {});
afficherOnglet();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
