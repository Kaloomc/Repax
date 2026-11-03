// --- Outils ------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const euros = (n) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const jourSemaine = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' });
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
const ICONES = { 'Midi simple': '🥪', 'Plat du soir': '🍲', 'Les deux': '🥪🍲' };

const barre = (valeur, max) => {
  const pc = max > 0 ? Math.min(100, (valeur / max) * 100) : 100;
  return `<div class="barre"><div style="width:${pc}%" class="${valeur > max ? 'depasse' : ''}"></div></div>`;
};

function quantite(q, unite) {
  if (!(q > 0)) return '';
  if (unite === 'kg') return q < 1 ? `${Math.max(1, Math.round(q * 1000))} g` : `${q.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
  if (unite === 'L') return q < 1 ? `${Math.max(1, Math.round(q * 100))} cl` : `${q.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;
  if (unite === 'pièce') return `${Math.round(q * 10) / 10}`;
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

// --- 7 prochains jours, courses, placard ---------------------------------------
let donnees;

async function chargerSemaine() {
  donnees = await api('/api/semaine');
  afficherSemaine();
  afficherCourses();
}

function afficherSemaine() {
  const s = donnees;
  $('#resume-semaine').innerHTML = `
    <div class="chiffres">
      <div><small>Courses à faire</small><strong>${euros(s.total)}</strong><small>paquets entiers</small></div>
      <div><small>Budget 7 jours</small><strong>${euros(s.budget)}</strong><small class="${s.total > s.budget ? 'rouge' : 'vert'}">${s.total > s.budget ? 'dépassé de ' + euros(s.total - s.budget) : 'reste ' + euros(s.budget - s.total)}</small></div>
    </div>
    ${barre(s.total, s.budget)}
    <p class="aide">Du ${jourLong(s.debut)} au ${jourLong(s.fin)}${s.restes ? ' · restes du soir le lendemain midi' : ''}</p>`;
  $('#proposer').textContent = s.repas.length ? '🔁 Proposer d’autres repas' : '✨ Proposer les repas';

  if (!s.repas.length) {
    $('#jours').innerHTML = '<p class="vide">Pas encore de repas prévus.</p>';
    return;
  }
  const parJour = Object.groupBy(s.repas, (r) => r.date);
  $('#jours').innerHTML = Object.entries(parJour).map(([date, repas]) => `
    <div class="jour carte">
      <h3>${jourLong(date)}</h3>
      ${repas.map((r) => `
        <div class="repas">
          <span class="moment">${r.moment}</span>
          <span class="nom">${r.restes ? '♻️ Restes : ' : ICONES[r.type] ? ICONES[r.type] + ' ' : ''}${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.repas)}</a>` : esc(r.repas)}${r.supprimee ? ' <small>(recette supprimée)</small>' : ''}${r.portions > 1 && !r.restes ? ` <small>× ${r.portions} portions</small>` : ''}</span>
          <span class="cout">${r.restes ? '' : r.cout > 0 ? euros(r.cout) : '<small>placard</small>'}</span>
        </div>`).join('')}
    </div>`).join('');
}

$('#proposer').addEventListener('click', async (e) => {
  if (donnees?.repas.length && !confirm('Remplacer les repas à venir ? Ce que tu as déjà acheté reste au placard.')) return;
  const bouton = e.target;
  bouton.disabled = true;
  dire($('#message-semaine'), modeNotion ? 'Je choisis les repas et je les range dans Notion (20 à 30 secondes)…' : 'Je choisis les repas…');
  try {
    donnees = await api('/api/semaine', { method: 'POST', body: {} });
    afficherSemaine();
    afficherCourses();
    const g = donnees.gaspillage || [];
    dire($('#message-semaine'), g.length
      ? `⚠️ Risque de jeter : ${g.map((x) => x.nom).join(', ')} (${euros(g.reduce((s, x) => s + x.valeur, 0))}).`
      : '✔ Rien ne devrait se perdre.');
  } catch (err) {
    dire($('#message-semaine'), err.message);
  } finally {
    bouton.disabled = false;
  }
});

function ligneCourse(c) {
  if (c.unite === 'placard') return `<span class="nom">${esc(c.article)}</span>`;
  const taille = c.paquets && c.quantite / c.paquets;
  const detail = c.paquets
    ? `${c.unite === 'pièce' && taille === 1 ? `× ${c.paquets}` : `${c.paquets} × ${quantite(taille, c.unite)}${c.unite === 'pièce' ? ' pièces' : ''}`}${c.besoin && c.quantite - c.besoin > 1e-6 ? ` · il en faut ${quantite(c.besoin, c.unite)}` : ''}`
    : 'prix inconnu';
  return `
    <label class="case">
      <input type="checkbox" data-id="${esc(c.id)}" ${c.achete ? 'checked' : ''}>
      <span class="nom">${esc(c.article)} <small>${detail}${c.pour ? ` · dès ${jourSemaine(c.pour)}` : ''}</small></span>
    </label>
    <span class="cout">${euros(c.cout)}</span> ${badge(c.source)}`;
}

function afficherCourses() {
  const s = donnees;
  $('#resume-courses').innerHTML = `
    <div class="chiffres">
      <div><small>Total</small><strong>${euros(s.total)}</strong></div>
      <div><small>Reste à acheter</small><strong>${euros(s.resteAAcheter)}</strong></div>
      <div><small>Budget</small><strong>${euros(s.budget)}</strong></div>
    </div>
    ${barre(s.total, s.budget)}
    <p class="aide">Paquets entiers, au prix du paquet. « dès mar. » = premier repas qui l'utilise. Coche ce que tu achètes : ça part au placard.</p>`;
  if (!s.courses.length) {
    $('#liste-courses').innerHTML = '<p class="vide">La liste se remplit quand tu proposes les repas.</p>';
  } else {
    const rayons = Object.groupBy(s.courses, (c) => c.rayon);
    const ordre = Object.keys(rayons).sort((a, b) => (a === 'Placard') - (b === 'Placard') || a.localeCompare(b, 'fr'));
    $('#liste-courses').innerHTML = ordre.map((rayon) => `
      <h3>${esc(rayon === 'Placard' ? 'Épices & condiments (à avoir)' : rayon)}</h3>
      <ul class="liste">
        ${rayons[rayon].map((c) => `<li class="${c.achete ? 'achete' : ''}">${ligneCourse(c)}</li>`).join('')}
      </ul>`).join('');
  }

  $('#liste-stock').innerHTML = s.stock.length ? s.stock.map((l) => `
    <li class="${l.perime ? 'perime' : ''}">
      <span class="nom">${esc(l.nom)} <small>${l.perime ? '⚠️ périmé ?' : 'à finir avant le ' + jourCourt(l.peremption)}</small></span>
      <button class="lien cout" data-stock="${esc(l.id)}" data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" data-quantite="${l.quantite}">${quantite(l.quantite, l.unite) || l.quantite}</button>
      <button class="petit secondaire" data-jeter="${esc(l.id)}" aria-label="Retirer">✕</button>
    </li>`).join('') : '<p class="vide">Le placard est vide.</p>';

  const select = $('#form-stock').nom;
  if (!select.options.length) {
    select.innerHTML = s.produits.map((p) => `<option value="${esc(p.nom)}" data-unite="${esc(p.unite)}">${esc(p.nom)}</option>`).join('');
    majUniteStock();
  }
}

$('#liste-courses').addEventListener('change', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  e.target.disabled = true;
  try {
    await api(`/api/courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: { achete: e.target.checked } });
  } catch (err) {
    alert(err.message);
  }
  chargerSemaine();
});

// Le placard se saisit dans l'unité de prix (kg, L ou pièces) ; on montre l'unité à côté.
const majUniteStock = () => {
  const o = $('#form-stock').nom.selectedOptions[0];
  $('#unite-stock').textContent = o ? `(${o.dataset.unite === 'pièce' ? 'pièces' : o.dataset.unite})` : '';
};
$('#form-stock').nom.addEventListener('change', majUniteStock);

$('#form-stock').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/stock', { method: 'POST', body: { nom: f.nom.value, quantite: Number(f.quantite.value) } });
    f.quantite.value = '';
    dire(f, 'Ajouté ✔ Repropose les repas pour en profiter.');
    chargerSemaine();
  } catch (err) {
    dire(f, err.message);
  }
});

$('#liste-stock').addEventListener('click', async (e) => {
  const { stock, nom, unite, quantite: q, jeter } = e.target.dataset;
  try {
    if (jeter) {
      if (!confirm('Retirer du placard ?')) return;
      await api(`/api/stock/${encodeURIComponent(jeter)}`, { method: 'DELETE' });
    } else if (stock) {
      const reponse = prompt(`Combien de « ${nom} » te reste-t-il ? (en ${unite === 'pièce' ? 'pièces' : unite}, 0 pour retirer)`, q);
      if (reponse === null) return;
      await api(`/api/stock/${encodeURIComponent(stock)}`, { method: 'PATCH', body: { quantite: Number(reponse.replace(',', '.')) } });
    } else return;
    chargerSemaine();
  } catch (err) {
    alert(err.message);
  }
});

// --- Recettes ----------------------------------------------------------------
async function chargerRecettes() {
  const recettes = await api('/api/recettes');
  $('#mes-recettes').innerHTML = recettes.length ? recettes.map((r) => `
    <li class="recette">
      <details>
        <summary>
          <span class="nom">${ICONES[r.type] || ''} ${esc(r.nom)}</span>
          <span class="cout">${euros(r.coutPortion)}<small>/portion</small></span>
          ${r.estime ? '<span class="pastille estime">prix estimés</span>' : ''}
        </summary>
        <label class="type-recette">Type de repas
          <select data-type="${esc(r.id)}">
            ${['Midi simple', 'Plat du soir', 'Les deux'].map((t) => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <p class="aide">${r.portions} portions · ${r.nbIngredients} ingrédients${r.temps ? ` · ⏱ ${r.temps} min` : ''}${r.difficulte ? ` · ${esc(r.difficulte)}` : ''} · total ${euros(r.cout)}
          ${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">voir sur Marmiton</a>` : ' · recette d’exemple'}</p>
        <ul class="ingredients">
          ${r.lignes.map((l) => `<li><span>${esc(l.brut)}</span>${l.placard ? '<small>placard</small>' : `<span>${euros(l.cout)} ${l.inconnu ? '<span class="pastille estime">non reconnu</span>' : badge(l.source)}</span>`}</li>`).join('')}
        </ul>
        <button class="secondaire" data-supprimer="${esc(r.id)}">Supprimer la recette</button>
      </details>
    </li>`).join('') : '<p class="vide">Aucune recette. Cherche sur Marmiton ci-dessus.</p>';
}

$('#mes-recettes').addEventListener('change', async (e) => {
  const id = e.target.dataset.type;
  if (!id) return;
  await api(`/api/recettes/${encodeURIComponent(id)}`, { method: 'PATCH', body: { type: e.target.value } }).catch((err) => alert(err.message));
  chargerRecettes();
});

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
    dire(form, r.deja ? `« ${r.nom} » est déjà dans tes recettes.` : `« ${r.nom} » ajoutée ✔ (${r.type})`);
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
  f.restes.checked = b.restes;
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
      body: { budget: Number(f.budget.value), periode: f.periode.value, personnes: Number(f.personnes.value), repas, restes: f.restes.checked },
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
