// ============================================================================
// Outils
// ============================================================================
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const euros = (n) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const ic = (nom, classe = '') => `<svg class="i ${classe}" aria-hidden="true"><use href="#i-${nom}"/></svg>`;
const dateDans = (jours) => new Date(Date.now() + jours * 864e5).toLocaleDateString('sv-SE');
const enDate = (iso) => new Date(iso + 'T12:00:00');
const jourCourt = (iso) => enDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const jourSemaine = (iso) => enDate(iso).toLocaleDateString('fr-FR', { weekday: 'short' });
const joursEntre = (a, b) => Math.round((enDate(b) - enDate(a)) / 864e5);

// « Aujourd'hui », « Demain », sinon « vendredi »
function jourRelatif(iso, aujourdhui = dateDans(0)) {
  const n = joursEntre(aujourdhui, iso);
  if (n === 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  return enDate(iso).toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase());
}
// « 4 – 10 nov. »
function plage(debut, fin) {
  const d = enDate(debut), f = enDate(fin);
  return d.getMonth() === f.getMonth() ? `${d.getDate()} – ${jourCourt(fin)}` : `${jourCourt(debut)} – ${jourCourt(fin)}`;
}

function quantite(q, unite) {
  if (!(q > 0)) return '';
  if (unite === 'kg') return q < 1 ? `${Math.max(1, Math.round(q * 1000))} g` : `${q.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
  if (unite === 'L') return q < 1 ? `${Math.max(1, Math.round(q * 100))} cl` : `${q.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;
  if (unite === 'pièce') return `× ${(Math.round(q * 10) / 10).toLocaleString('fr-FR')}`;
  return '';
}

const ESTIME = 'Estimation par catégorie';
const ILLUSTRATIONS = { 'Midi simple': '🥪', 'Plat du soir': '🍲', 'Les deux': '🍽️' };
const vignette = (r) => `<span class="vignette">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : ILLUSTRATIONS[r.type] || '🍽️'}</span>`;

// Niveau d'une jauge : vert < 80 %, orange 80–100 %, rouge au-delà.
const niveau = (valeur, max) => (max <= 0 || valeur > max ? 'rouge' : valeur >= 0.8 * max ? 'orange' : 'vert');
const jauge = (valeur, max) => `<div class="jauge ${niveau(valeur, max)}" role="presentation"><div style="width:${max > 0 ? Math.min(100, (valeur / max) * 100) : 100}%"></div></div>`;

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

const dire = (el, texte) => {
  (el.querySelector?.('.message') || el).textContent = texte;
};

// ---- Toast (avec « Annuler » si besoin) ----
let minuterieToast;
function toast(texte, annuler) {
  const t = $('#toast');
  $('#toast-texte').textContent = texte;
  const b = $('#toast-annuler');
  b.hidden = !annuler;
  b.onclick = async () => {
    t.hidden = true;
    await annuler();
  };
  t.hidden = false;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => (t.hidden = true), annuler ? 8000 : 3500);
}

// ---- Feuille du bas ----
const feuille = $('#feuille');
function ouvrirFeuille(html) {
  $('#feuille-contenu').innerHTML = html;
  if (!feuille.open) feuille.showModal();
}
const fermerFeuille = () => feuille.open && feuille.close();
feuille.querySelector('.fermer').addEventListener('click', fermerFeuille);
feuille.addEventListener('click', (e) => e.target === feuille && fermerFeuille()); // clic sur le voile

// ---- Écran allumé (mode cuisine, mode magasin) ----
let verrouEcran = null;
async function garderEcranAllume(oui) {
  try {
    if (oui && !verrouEcran) verrouEcran = await navigator.wakeLock?.request('screen');
    if (!oui && verrouEcran) {
      await verrouEcran.release();
      verrouEcran = null;
    }
  } catch {} // pas grave si le navigateur ne sait pas faire
}

// ============================================================================
// En-tête, onglets, thème, état Notion
// ============================================================================
const TITRES = { semaine: 'Semaine', courses: 'Courses', recettes: 'Recettes', prix: 'Prix', budget: 'Budget', connexion: 'Connexion' };
const CHARGER = {
  semaine: () => chargerSemaine(),
  courses: () => chargerSemaine(),
  recettes: () => chargerRecettes(),
  prix: () => chargerPrix(),
  budget: () => chargerBudget(),
};
const sousTitre = (texte) => ($('#sous-titre').textContent = texte || '');

function afficherOnglet() {
  const id = location.hash.slice(1) || 'semaine';
  document.querySelectorAll('main > section').forEach((s) => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach((a) => {
    const actif = a.hash === '#' + id;
    a.classList.toggle('active', actif);
    if (actif) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#titre').textContent = TITRES[id] || 'Repas';
  sousTitre('');
  if (id !== 'courses' && document.body.classList.contains('magasin')) basculerMagasin(false);
  scrollTo(0, 0);
  CHARGER[id]?.().catch((err) => {
    console.error(err);
    toast(err.message);
  });
}
addEventListener('hashchange', afficherOnglet);
addEventListener('scroll', () => $('#entete').classList.toggle('replie', scrollY > 8), { passive: true });

let etat = { mode: null };
function majEtat() {
  const b = $('#etat');
  b.hidden = !etat.mode;
  b.className = `puce discrete ${etat.mode === 'notion' ? 'ok' : 'attention'}`;
  b.innerHTML = etat.mode === 'notion' ? `${ic('check')} Notion` : 'Démo';
}
const texteEtat = () => etat.mode === 'notion'
  ? `<p>${ic('check')} <b>Connecté à Notion.</b> Les recettes, le planning, la liste et le placard viennent de ta page Notion, et tout ce que tu fais ici y est écrit.</p>`
  : `<p><b>Mode démo :</b> l'appli n'est pas reliée à Notion. Elle utilise ses propres recettes d'exemple et garde tout dans un fichier sur le serveur.</p>
     <p class="aide">Pour la brancher sur Notion, ajoute <code>NOTION_TOKEN</code> et <code>NOTION_PAGE_ID</code> (le lien de ta page « Gestion ») dans le projet Container Manager, puis redémarre-le.</p>`;
$('#etat').addEventListener('click', () => ouvrirFeuille(`<h2 id="feuille-titre">Où sont mes données ?</h2>${texteEtat()}`));

// Thème : auto (suit le téléphone), clair ou sombre
const lireTheme = () => {
  try {
    return localStorage.getItem('theme') || 'auto';
  } catch {
    return 'auto';
  }
};
function appliquerTheme(t) {
  try {
    localStorage.setItem('theme', t);
  } catch {}
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
$('#bouton-reglages').addEventListener('click', () => {
  const t = lireTheme();
  ouvrirFeuille(`
    <h2 id="feuille-titre">Affichage</h2>
    <div class="segments" role="group" aria-label="Thème">
      ${[['auto', 'Auto'], ['clair', 'Clair'], ['sombre', 'Sombre']].map(([v, l]) => `<button type="button" data-theme="${v}" aria-pressed="${t === v}">${l}</button>`).join('')}
    </div>
    <p class="aide">« Auto » suit le réglage clair / sombre du téléphone.</p>
    <h3>Données</h3>
    ${texteEtat()}
    <p class="aide">Budget, repas à prévoir et plats exclus se règlent dans l'onglet Budget.</p>`);
});
$('#feuille-contenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  appliquerTheme(b.dataset.theme);
  b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
});

// Connexion
$('#form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/connexion', { method: 'POST', body: { motDePasse: e.target.motDePasse.value } });
    location.hash = '#semaine';
  } catch (err) {
    dire(e.target, err.message);
  }
});

// ============================================================================
// Semaine
// ============================================================================
let donnees;

async function chargerSemaine() {
  if (!donnees) {
    $('#jours').innerHTML = '<div class="squelette" style="height:64px"></div>'.repeat(4);
    $('#liste-courses').innerHTML = '<div class="squelette" style="height:56px"></div>'.repeat(5);
  }
  donnees = await api('/api/semaine');
  afficherSemaine();
  afficherCourses();
}

function afficherSemaine() {
  const s = donnees;
  if (location.hash === '#semaine' || !location.hash) sousTitre(plage(s.debut, s.fin));
  const reste = s.budget - s.total;
  const maj = s.auto?.dernier ? new Date(s.auto.dernier) : null;
  $('#jauge-semaine').innerHTML = `
    <div class="synthese">
      <div class="tete">
        <div>
          <span class="libelle">${reste >= 0 ? 'Reste sur le budget' : 'Budget dépassé de'}</span>
          <span class="grand ${niveau(s.total, s.budget)}">${euros(Math.abs(reste))}</span>
        </div>
        <div class="droite">
          <span class="libelle">Courses à faire</span>
          <b>${euros(s.total)}</b> <small>sur ${euros(s.budget)}</small>
        </div>
      </div>
      ${jauge(s.total, s.budget)}
      <p class="meta">${maj ? `Mis à jour ${maj.toDateString() === new Date().toDateString() ? 'aujourd’hui' : 'le ' + maj.toLocaleDateString('fr-FR')} à ${maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Pas encore mis à jour'} · paquets entiers${s.restes ? ' · restes le midi' : ''}</p>
      ${s.auto?.erreur ? `<p class="meta rouge">${ic('alert')} ${esc(s.auto.erreur)}</p>` : ''}
      ${s.agendix ? `<p class="meta orange">${ic('alert')} ${esc(s.agendix)}</p>` : ''}
    </div>`;
  $('#proposer-texte').textContent = s.repas.some((r) => !r.passe) ? "Proposer d'autres repas" : 'Proposer les repas';

  const lignes = [...s.repas, ...s.absences].sort((a, b) => (a.date + (a.moment === 'soir' ? 2 : 1)).localeCompare(b.date + (b.moment === 'soir' ? 2 : 1)));
  if (!lignes.length) {
    $('#jours').innerHTML = '<p class="vide">Pas encore de repas prévus.<br>Touche « Proposer les repas ».</p>';
    return;
  }
  const parJour = Object.groupBy(lignes, (r) => r.date);
  $('#jours').innerHTML = Object.entries(parJour).map(([date, repas]) => {
    const total = repas.filter((r) => !r.lieu && !r.ailleurs).reduce((t, r) => t + (r.cout || 0), 0);
    return `
      <div class="jour ${date === s.aujourdhui ? 'aujourdhui' : ''}">
        <div class="jour-tete">
          <h2>${jourRelatif(date, s.aujourdhui)} <small>${jourCourt(date)}</small></h2>
          ${total ? `<span class="meta chiffre">${euros(total)}</span>` : ''}
        </div>
        ${repas.map(ligneRepas).join('')}
      </div>`;
  }).join('');
}

function ligneRepas(r) {
  if (r.lieu) {
    return `<div class="repas absent">${ic('home')}<span>${r.lieu === 'Parents' ? 'Chez les parents' : esc(r.lieu)}</span><span class="moment-etiquette">${r.moment}</span></div>`;
  }
  const meta = [r.temps ? `${r.temps} min` : '', r.restes ? 'restes' : r.ailleurs ? 'mangé ailleurs' : r.cout > 0 ? euros(r.cout) : 'placard'].filter(Boolean).join(' · ');
  const puces = [
    r.garde ? `<span class="puce info">${ic('pin')} Épinglé</span>` : '',
    r.restes ? '<span class="puce">Restes</span>' : '',
    r.supprimee ? '<span class="puce attention">Recette supprimée</span>' : '',
  ].join('');
  const ouvrable = r.recette && !r.supprimee;
  return `
    <div class="repas ${r.passe ? 'passe' : ''} ${r.ailleurs ? 'ailleurs' : ''}">
      <button class="repas-ouvrir" ${ouvrable ? `data-fiche="${esc(r.recette)}" data-portions="${r.portions || 1}"` : 'disabled'} aria-label="${esc(r.repas)}, ${r.moment}${ouvrable ? ' : voir la recette' : ''}">
        ${vignette(r)}
        <span class="repas-texte">
          <span class="moment-etiquette">${r.moment}</span>
          <span class="repas-nom">${esc(r.repas || 'Repas')}</span>
          <span class="repas-meta">${meta}</span>
        </span>
      </button>
      ${puces ? `<span class="puces">${puces}</span>` : ''}
      ${r.passe ? '' : `<button class="icone-seule" data-menu="${esc(r.id)}" aria-label="Actions pour ${esc(r.repas)}">${ic('more')}</button>`}
    </div>`;
}

$('#jours').addEventListener('click', (e) => {
  const fiche = e.target.closest('[data-fiche]');
  if (fiche) return ouvrirFiche(fiche.dataset.fiche, { portions: Number(fiche.dataset.portions) || 1 });
  const menu = e.target.closest('[data-menu]');
  if (menu) ouvrirMenuRepas(donnees.repas.find((x) => x.id === menu.dataset.menu));
});

// Menu « ⋯ » d'un repas : toutes les actions, avec leur libellé.
function ouvrirMenuRepas(r) {
  ouvrirFeuille(`
    <h2 id="feuille-titre">${esc(r.repas)}</h2>
    <p class="aide">${jourRelatif(r.date, donnees.aujourdhui)} ${jourCourt(r.date)}, ${r.moment}</p>
    <div class="actions-feuille">
      ${r.recette && !r.supprimee ? `<button class="bouton secondaire" data-action-repas="voir">${ic('book')} Voir la recette</button>` : ''}
      ${r.ailleurs ? '' : `<button class="bouton secondaire" data-action-repas="garde">${ic('pin')} ${r.garde ? 'Ne plus épingler' : 'Épingler (ne bouge plus)'}</button>`}
      ${r.ailleurs ? '' : `<button class="bouton secondaire" data-action-repas="changer">${ic('refresh')} Remplacer ce repas</button>`}
      <button class="bouton secondaire" data-action-repas="ailleurs">${ic('utensils')} ${r.ailleurs ? 'Finalement je le mange' : 'Mangé ailleurs (rien à cuisiner)'}</button>
      <button class="bouton discret" data-action-repas="fermer">Annuler</button>
    </div>`);
  feuille.dataset.repas = r.id;
}

$('#feuille-contenu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action-repas]');
  if (!b) return;
  const action = b.dataset.actionRepas;
  const r = donnees.repas.find((x) => x.id === feuille.dataset.repas);
  if (action === 'fermer') return fermerFeuille();
  if (action === 'voir') return ouvrirFiche(r.recette, { portions: r.portions || 1 });
  fermerFeuille();
  try {
    if (action === 'garde') {
      await api(`/api/planning/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: { garde: !r.garde } });
      donnees = await api('/api/semaine');
      toast(r.garde ? 'Repas désépinglé' : 'Repas épinglé : il ne bougera plus');
    } else if (action === 'ailleurs') {
      await api(`/api/planning/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: { ailleurs: !r.ailleurs } });
      donnees = await api('/api/semaine', { method: 'POST', body: { recalculer: true } });
      toast('Liste de courses mise à jour');
    } else if (action === 'changer') {
      donnees = await api('/api/semaine', { method: 'POST', body: { changer: r.id } });
      toast('Repas remplacé', annulerProposition);
    }
  } catch (err) {
    toast(err.message);
  }
  afficherSemaine();
  afficherCourses();
});

async function annulerProposition() {
  try {
    donnees = await api('/api/semaine/annuler', { method: 'POST' });
    dire($('#message-semaine'), '');
    afficherSemaine();
    afficherCourses();
    toast('Repas d’avant remis');
  } catch (err) {
    toast(err.message);
  }
}

$('#proposer').addEventListener('click', async (e) => {
  const bouton = e.currentTarget;
  bouton.disabled = true;
  dire($('#message-semaine'), etat.mode === 'notion' ? 'Je choisis les repas et je les range dans Notion…' : 'Je choisis les repas…');
  try {
    donnees = await api('/api/semaine', { method: 'POST', body: {} });
    afficherSemaine();
    afficherCourses();
    const g = donnees.gaspillage || [];
    dire($('#message-semaine'), g.length ? `Risque de jeter : ${g.map((x) => x.nom).join(', ')} (${euros(g.reduce((t, x) => t + x.valeur, 0))}).` : '');
    toast('Nouveaux repas proposés', annulerProposition);
  } catch (err) {
    dire($('#message-semaine'), err.message);
  } finally {
    bouton.disabled = false;
  }
});

// ============================================================================
// Fiche recette, mode cuisine, ajouter au planning
// ============================================================================
const listeEtapes = (etapes) => String(etapes || '').split('\n').map((x) => x.replace(/^\s*\d+\s*[.)-]\s*/, '').trim()).filter(Boolean);
let ficheOuverte = null;

async function ouvrirFiche(id, { portions = 1, depuisRecettes = false } = {}) {
  try {
    const r = await api(`/api/recettes/${encodeURIComponent(id)}`);
    ficheOuverte = { r, portions };
    const pour = (l) => {
      if (l.inconnu || l.placard || !l.qte) return '';
      return `<small>${quantite((l.qte * portions) / r.portions, l.unite)}</small>`;
    };
    const etapes = listeEtapes(r.etapes);
    ouvrirFeuille(`
      ${r.image ? `<img class="illustration" src="${esc(r.image)}" alt="">` : ''}
      <h2 id="feuille-titre">${esc(r.nom)}</h2>
      <div class="meta-ligne">
        ${r.temps ? `<span class="puce">${ic('clock')} ${r.temps} min</span>` : ''}
        <span class="puce">${esc(r.difficulte)}</span>
        <span class="puce">${r.estime ? '≈ ' : ''}${euros(r.coutPortion)} / portion</span>
        <span class="puce">${ILLUSTRATIONS[r.type] || ''} ${esc(r.type)}</span>
      </div>
      ${r.exclue?.length ? `<p class="aide orange">${ic('alert')} Jamais proposée : ${esc(r.exclue.join(', '))}.</p>` : ''}
      <div class="actions-feuille">
        ${etapes.length ? `<button class="bouton principal" data-fiche-action="cuisine">${ic('chef')} Mode cuisine</button>` : ''}
        <button class="bouton secondaire" data-fiche-action="planning">${ic('calendar-plus')} Ajouter au planning</button>
      </div>
      <h3>Ingrédients · pour ${portions} portion${portions > 1 ? 's' : ''}</h3>
      <ul class="ingredients">${r.lignes.map((l) => `<li><span>${esc(l.brut)}</span>${pour(l)}</li>`).join('')}</ul>
      <p class="aide">Recette écrite pour ${r.portions} : les quantités en vert sont pour toi.</p>
      <h3>Étapes</h3>
      ${etapes.length ? `<ol class="etapes">${etapes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="aide">Pas d’étapes pour cette recette.</p>'}
      ${depuisRecettes ? `
        <h3>Réglages de la recette</h3>
        <label>Type de repas
          <select data-fiche-type>${['Midi simple', 'Plat du soir', 'Les deux'].map((t) => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </label>` : ''}
      <div class="actions-feuille">
        ${r.url ? `<a class="bouton discret" href="${esc(r.url)}" target="_blank" rel="noopener">${ic('external')} Voir sur Marmiton</a>` : ''}
        ${depuisRecettes ? `<button class="bouton danger" data-fiche-action="supprimer">${ic('trash')} Supprimer la recette</button>` : ''}
      </div>`);
  } catch (err) {
    toast(err.message);
  }
}

$('#feuille-contenu').addEventListener('change', async (e) => {
  if (!e.target.matches('[data-fiche-type]')) return;
  await api(`/api/recettes/${encodeURIComponent(ficheOuverte.r.id)}`, { method: 'PATCH', body: { type: e.target.value } }).catch((err) => toast(err.message));
  toast('Type de repas enregistré');
  chargerRecettes();
});

$('#feuille-contenu').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-fiche-action], [data-creneau]');
  if (!b || !ficheOuverte) return;
  const { r } = ficheOuverte;
  if (b.dataset.ficheAction === 'cuisine') {
    fermerFeuille();
    return ouvrirCuisine(r, ficheOuverte.portions);
  }
  if (b.dataset.ficheAction === 'planning') return choisirCreneau(r);
  if (b.dataset.ficheAction === 'supprimer') {
    if (!confirm(`Supprimer « ${r.nom} » ?`)) return;
    await api(`/api/recettes/${encodeURIComponent(r.id)}`, { method: 'DELETE' }).catch((err) => toast(err.message));
    fermerFeuille();
    toast('Recette supprimée');
    return chargerRecettes();
  }
  if (b.dataset.creneau) {
    const [date, moment] = b.dataset.creneau.split('|');
    try {
      await api('/api/planning', { method: 'POST', body: { recette: r.id, date, moment } });
      fermerFeuille();
      toast(`${r.nom} : ${jourRelatif(date).toLowerCase()} ${moment}, épinglé`);
      donnees = await api('/api/semaine');
      if (location.hash === '#semaine' || location.hash === '#courses') {
        afficherSemaine();
        afficherCourses();
      }
    } catch (err) {
      toast(err.message);
    }
  }
});

// Choisir à quel repas mettre une recette (les 7 prochains jours).
async function choisirCreneau(r) {
  if (!donnees) donnees = await api('/api/semaine');
  const occupe = new Map(donnees.repas.map((x) => [x.date + x.moment, x]));
  const absents = new Set(donnees.absences.map((x) => x.date + x.moment));
  const creneaux = [];
  for (let j = 0; j < 8; j++) {
    const date = dateDans(j);
    for (const moment of ['midi', 'soir']) {
      const x = occupe.get(date + moment);
      if (x?.passe || (!x && j === 0 && new Date().getHours() >= (moment === 'midi' ? 14 : 21))) continue;
      creneaux.push({ date, moment, x, absent: absents.has(date + moment) });
    }
  }
  ouvrirFeuille(`
    <h2 id="feuille-titre">Ajouter « ${esc(r.nom)} »</h2>
    <p class="aide">Le repas choisi sera remplacé et épinglé.</p>
    <ul class="liste">${creneaux.slice(0, 14).map((c) => `
      <li>
        <button class="repas-ouvrir" data-creneau="${c.date}|${c.moment}">
          <span class="repas-texte">
            <span class="moment-etiquette">${jourRelatif(c.date)} · ${c.moment}</span>
            <span class="repas-meta">${c.absent ? 'Pas à Angoulême' : c.x ? esc(c.x.repas) : 'Libre'}</span>
          </span>
        </button>
      </li>`).join('')}</ul>`);
}

// ---- Mode cuisine : une étape par écran, texte grand, écran allumé ----
const cuisine = $('#cuisine');
let etapeCourante = 0, etapesCuisine = [];
function ouvrirCuisine(r, portions) {
  etapesCuisine = listeEtapes(r.etapes);
  etapeCourante = 0;
  $('#cuisine-titre').textContent = r.nom;
  $('#cuisine-ingredients').innerHTML = r.lignes.map((l) => `<li><span>${esc(l.brut)}</span>${l.qte && !l.inconnu && !l.placard ? `<small>${quantite((l.qte * portions) / r.portions, l.unite)}</small>` : ''}</li>`).join('');
  montrerEtape();
  cuisine.showModal();
  garderEcranAllume(true);
}
function montrerEtape() {
  $('#cuisine-compteur').textContent = `Étape ${etapeCourante + 1} sur ${etapesCuisine.length}`;
  $('#cuisine-etape').textContent = etapesCuisine[etapeCourante];
  $('#cuisine-precedent').disabled = etapeCourante === 0;
  const fin = etapeCourante === etapesCuisine.length - 1;
  $('#cuisine-suivant').innerHTML = fin ? `${ic('check')} Terminé` : `Suivante ${ic('right')}`;
}
$('#cuisine-precedent').addEventListener('click', () => {
  etapeCourante = Math.max(0, etapeCourante - 1);
  montrerEtape();
});
$('#cuisine-suivant').addEventListener('click', () => {
  if (etapeCourante === etapesCuisine.length - 1) return cuisine.close();
  etapeCourante++;
  montrerEtape();
});
cuisine.querySelector('.fermer').addEventListener('click', () => cuisine.close());
cuisine.addEventListener('close', () => garderEcranAllume(false));

// ============================================================================
// Courses
// ============================================================================
const RAYONS = ['Fruits & légumes', 'Épicerie', 'Viandes & poissons', 'Frais', 'Autres']; // ordre de passage au Super U
const rangRayon = (r) => (RAYONS.includes(r) ? RAYONS.indexOf(r) : RAYONS.length);
const manuelle = (c) => !c.source && c.unite !== 'placard';
let tri = (() => {
  try {
    return localStorage.getItem('tri') || 'rayon';
  } catch {
    return 'rayon';
  }
})();

function detailArticle(c) {
  if (manuelle(c)) return 'Ajouté à la main';
  if (!c.paquets) return 'Prix inconnu (compté 0,50 €)';
  const taille = c.quantite / c.paquets;
  const paquet = c.unite === 'pièce' ? (taille === 1 ? '' : `${taille} pièces`) : quantite(taille, c.unite);
  const besoin = c.besoin && c.quantite - c.besoin > 1e-6 ? ` · besoin : ${c.unite === 'pièce' ? (Math.round(c.besoin * 10) / 10).toLocaleString('fr-FR') : quantite(c.besoin, c.unite)}` : '';
  return `${c.paquets > 1 || !paquet ? `${c.paquets} × ` : ''}${paquet ? `Paquet : ${paquet}` : 'pièce' + (c.paquets > 1 ? 's' : '')}${besoin}`;
}

function ligneArticle(c) {
  return `
    <li class="article ${c.achete ? 'achete' : ''}" data-article="${esc(c.id)}">
      <label class="coche" aria-label="${c.achete ? 'Décocher' : 'Cocher'} ${esc(c.article)}">
        <input type="checkbox" data-id="${esc(c.id)}" ${c.achete ? 'checked' : ''}>
        <span class="rond">${ic('check')}</span>
      </label>
      <span class="texte"><b>${esc(c.article)}</b><small>${detailArticle(c)}</small></span>
      <span class="droite">
        ${c.cout ? `<span class="prix">${c.source === ESTIME ? '≈ ' : ''}${euros(c.cout)}</span>` : ''}
        ${c.pour && !c.achete ? `<span class="puce">dès ${jourSemaine(c.pour)}</span>` : ''}
      </span>
      ${manuelle(c) ? `<button class="icone-seule" data-supprimer-article="${esc(c.id)}" aria-label="Retirer ${esc(c.article)}">${ic('x')}</button>` : ''}
    </li>`;
}

function afficherCourses() {
  const s = donnees;
  const achetables = s.courses.filter((c) => c.unite !== 'placard');
  const restants = achetables.filter((c) => !c.achete);
  const pris = achetables.filter((c) => c.achete);
  const resteAAcheter = restants.reduce((t, c) => t + (c.cout || 0), 0);
  const dejaPris = pris.reduce((t, c) => t + (c.cout || 0), 0);
  const compteur = $('#compteur-courses');
  compteur.hidden = !restants.length;
  compteur.textContent = restants.length;
  if (location.hash === '#courses') sousTitre(`${restants.length} article${restants.length > 1 ? 's' : ''} à prendre`);

  $('#synthese-courses').innerHTML = `
    <div class="synthese">
      <div class="tete">
        <div><span class="libelle">Reste à acheter</span><span class="grand">${euros(resteAAcheter)}</span></div>
        <div class="droite"><span class="libelle">Déjà pris</span><b>${euros(dejaPris)}</b></div>
      </div>
      <div class="jauge" aria-hidden="true"><div style="width:${achetables.length ? (pris.length / achetables.length) * 100 : 0}%"></div></div>
      <p class="meta">${pris.length} / ${achetables.length} articles cochés · budget 7 jours ${euros(s.budget)}</p>
    </div>`;

  document.querySelectorAll('[data-tri]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tri === tri));
  if (!achetables.length) {
    $('#liste-courses').innerHTML = '<p class="vide">La liste se remplit quand les repas sont prévus.</p>';
  } else {
    const cleGroupe = tri === 'jour' ? (c) => c.pour || '9999' : (c) => c.rayon;
    const groupes = Object.entries(Object.groupBy(restants, cleGroupe))
      .sort(([a], [b]) => (tri === 'jour' ? a.localeCompare(b) : rangRayon(a) - rangRayon(b) || a.localeCompare(b, 'fr')));
    const titre = (k) => (tri === 'jour' ? (k === '9999' ? 'Sans date' : `${jourRelatif(k, s.aujourdhui)} ${jourCourt(k)}`) : k);
    const epices = s.courses.filter((c) => c.unite === 'placard');
    $('#liste-courses').innerHTML = `
      ${groupes.map(([k, articles]) => `
        <div class="groupe">
          <div class="groupe-tete"><h2>${esc(titre(k))}</h2><span>${euros(articles.reduce((t, c) => t + (c.cout || 0), 0))}</span></div>
          <ul class="liste">${articles.map(ligneArticle).join('')}</ul>
        </div>`).join('')}
      ${!restants.length ? `<p class="vide">${ic('check')} Tout est pris !</p>` : ''}
      ${pris.length ? `
        <details class="repliable">
          <summary>${ic('cart')} <span>Dans le panier</span> <b>${pris.length}</b>${ic('chevron', 'chevron')}</summary>
          <ul class="liste">${pris.map(ligneArticle).join('')}</ul>
        </details>` : ''}
      ${epices.length ? `
        <details class="repliable">
          <summary>${ic('package')} <span>Épices & condiments à avoir</span> <b>${epices.length}</b>${ic('chevron', 'chevron')}</summary>
          <div class="epices">${epices.map((c) => `<span class="puce">${esc(c.article)}</span>`).join('')}</div>
        </details>` : ''}`;
  }

  // Placard
  $('#nb-placard').textContent = s.stock.length;
  $('#liste-stock').innerHTML = s.stock.length ? s.stock.map((l) => `
    <li>
      <span class="texte"><b>${esc(l.nom)}</b><small class="${l.perime ? 'rouge' : ''}">${l.perime ? 'Périmé ?' : 'À finir avant le ' + jourCourt(l.peremption)}</small></span>
      <button class="bouton discret" data-stock="${esc(l.id)}" data-nom="${esc(l.nom)}" data-unite="${esc(l.unite)}" data-quantite="${l.quantite}">${quantite(l.quantite, l.unite) || l.quantite}</button>
      <button class="icone-seule" data-jeter="${esc(l.id)}" aria-label="Retirer ${esc(l.nom)} du placard">${ic('trash')}</button>
    </li>`).join('') : '<p class="vide">Le placard est vide.</p>';
  const select = $('#form-stock').nom;
  if (!select.options.length) {
    select.innerHTML = s.produits.map((p) => `<option value="${esc(p.nom)}" data-unite="${esc(p.unite)}">${esc(p.nom)}</option>`).join('');
    majUniteStock();
  }
}

document.querySelectorAll('[data-tri]').forEach((b) => b.addEventListener('click', () => {
  tri = b.dataset.tri;
  try {
    localStorage.setItem('tri', tri);
  } catch {}
  afficherCourses();
}));

// Cocher : l'article glisse dans « Dans le panier » (et entre au placard).
$('#liste-courses').addEventListener('change', async (e) => {
  const id = e.target.dataset.id;
  if (!id) return;
  const c = donnees.courses.find((x) => x.id === id);
  c.achete = e.target.checked;
  e.target.closest('.article').classList.add('part');
  setTimeout(afficherCourses, 180);
  try {
    await api(`/api/courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: { achete: c.achete } });
  } catch (err) {
    toast(err.message);
    chargerSemaine();
  }
});

$('#liste-courses').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-supprimer-article]');
  if (!b) return;
  await api(`/api/courses/${encodeURIComponent(b.dataset.supprimerArticle)}`, { method: 'DELETE' }).catch((err) => toast(err.message));
  chargerSemaine();
});

$('#form-article').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/courses', { method: 'POST', body: { article: f.article.value } });
    f.article.value = '';
    chargerSemaine();
  } catch (err) {
    toast(err.message);
  }
});

$('#aide-courses').addEventListener('click', () => ouvrirFeuille(`
  <h2 id="feuille-titre">Lire la liste</h2>
  <ul class="ingredients">
    <li><span><b>Paquet : 1 kg · besoin : 125 g</b><br>Tu achètes le paquet entier, au prix du paquet ; les repas n'en utilisent que 125 g. Le reste part au placard et sert pour les repas suivants.</span></li>
    <li><span><b>dès jeu.</b><br>Le premier repas qui en a besoin.</span></li>
    <li><span><b>≈ 2,49 €</b><br>Prix estimé : Open Prices n'a pas de relevé pour ce produit.</span></li>
    <li><span><b>Cocher</b><br>L'article est mis dans le panier et entre au placard.</span></li>
    <li><span><b>Ajouté à la main</b><br>Un article libre : le planning automatique n'y touche jamais.</span></li>
  </ul>`));

function basculerMagasin(oui) {
  document.body.classList.toggle('magasin', oui);
  $('#mode-magasin').setAttribute('aria-pressed', oui);
  garderEcranAllume(oui);
}
$('#mode-magasin').addEventListener('click', () => {
  const oui = !document.body.classList.contains('magasin');
  basculerMagasin(oui);
  toast(oui ? 'Mode magasin : gros texte, écran allumé' : 'Mode magasin désactivé');
});

$('#partager').addEventListener('click', async () => {
  const restants = donnees.courses.filter((c) => c.unite !== 'placard' && !c.achete);
  const texte = 'Courses :\n' + restants.map((c) => `☐ ${c.article}${c.paquets ? ` (${detailArticle(c).split(' · ')[0]})` : ''}`).join('\n');
  try {
    if (navigator.share) await navigator.share({ title: 'Liste de courses', text: texte });
    else {
      await navigator.clipboard.writeText(texte);
      toast('Liste copiée');
    }
  } catch {} // partage annulé
});

// Placard
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
    toast('Ajouté au placard');
    chargerSemaine();
  } catch (err) {
    dire(f, err.message);
  }
});
$('#liste-stock').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-stock], [data-jeter]');
  if (!b) return;
  const { stock, nom, unite, quantite: q, jeter } = b.dataset;
  try {
    if (jeter) {
      await api(`/api/stock/${encodeURIComponent(jeter)}`, { method: 'DELETE' });
      toast('Retiré du placard');
    } else {
      const reponse = prompt(`Combien de « ${nom} » te reste-t-il ? (en ${unite === 'pièce' ? 'pièces' : unite}, 0 pour retirer)`, q);
      if (reponse === null) return;
      await api(`/api/stock/${encodeURIComponent(stock)}`, { method: 'PATCH', body: { quantite: Number(reponse.replace(',', '.')) } });
    }
    chargerSemaine();
  } catch (err) {
    toast(err.message);
  }
});

// ============================================================================
// Recettes
// ============================================================================
const FILTRES = [
  ['faisables', 'Faisable chez moi', 'home'],
  ['rapide', 'Rapide', 'clock'],
  ['vege', 'Végé', null],
  ['pascher', 'Pas cher', 'tag'],
  ['stock', 'Avec mon stock', 'package'],
  ['favoris', 'Favoris', 'star'],
];
const TESTS = {
  faisables: (r) => !r.exclue.length,
  rapide: (r) => r.temps && r.temps <= 30,
  vege: (r) => r.vege,
  pascher: (r) => r.coutPortion <= 1.5,
  stock: (r) => r.enStock >= 0.5,
  favoris: (r) => r.favori,
};
const filtresActifs = new Set(['faisables']);
let recettes = [];

async function chargerRecettes() {
  if (!recettes.length) $('#mes-recettes').innerHTML = '<div class="squelette" style="height:64px"></div>'.repeat(5);
  const [liste, verif] = await Promise.all([api('/api/recettes'), api('/api/a-verifier')]);
  recettes = liste;
  afficherVerif(verif);
  afficherRecettes();
}

function carteRecette(r) {
  const meta = [r.temps ? `${r.temps} min` : '', r.difficulte, `${r.estime ? '≈ ' : ''}${euros(r.coutPortion)}/portion`].filter(Boolean).join(' · ');
  return `
    <div class="recette">
      <button class="repas-ouvrir" data-recette="${esc(r.id)}" aria-label="${esc(r.nom)} : voir la recette">
        ${vignette(r)}
        <span class="repas-texte">
          <span class="repas-nom">${esc(r.nom)}</span>
          <span class="repas-meta">${meta}</span>
          ${r.exclue.length ? `<span class="repas-meta orange">${esc(r.exclue.join(', '))}</span>` : ''}
        </span>
      </button>
      <button class="icone-seule favori" data-favori="${esc(r.id)}" aria-pressed="${r.favori}" aria-label="${r.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${ic('star')}</button>
    </div>`;
}

function afficherRecettes() {
  $('#filtres').innerHTML = FILTRES.map(([k, l, icone]) => `<button type="button" class="filtre" data-filtre="${k}" aria-pressed="${filtresActifs.has(k)}">${icone ? ic(icone) : ''}${l}</button>`).join('');
  const visibles = recettes.filter((r) => [...filtresActifs].every((f) => TESTS[f](r)));
  const impossibles = recettes.filter((r) => r.exclue.length);
  sousTitre(`${recettes.length - impossibles.length} recettes faisables`);
  $('#mes-recettes').innerHTML = visibles.length ? visibles.map(carteRecette).join('') : '<p class="vide">Aucune recette avec ces filtres.</p>';
  const nr = $('#non-realisables');
  nr.hidden = !impossibles.length || !filtresActifs.has('faisables');
  nr.querySelector('summary b').textContent = impossibles.length;
  nr.querySelector('.contenu').innerHTML = `<p class="aide">Four, ou plats que tu n'aimes pas (réglages dans l'onglet Budget). Elles ne sont jamais proposées.</p><div class="grille-recettes">${impossibles.map(carteRecette).join('')}</div>`;
}

$('#filtres').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtre]');
  if (!b) return;
  const k = b.dataset.filtre;
  if (filtresActifs.has(k)) filtresActifs.delete(k);
  else filtresActifs.add(k);
  afficherRecettes();
});

document.querySelector('#recettes').addEventListener('click', async (e) => {
  const ouvrir = e.target.closest('[data-recette]');
  if (ouvrir) return ouvrirFiche(ouvrir.dataset.recette, { portions: 1, depuisRecettes: true });
  const fav = e.target.closest('[data-favori]');
  if (fav) {
    const r = recettes.find((x) => x.id === fav.dataset.favori);
    r.favori = !r.favori;
    afficherRecettes();
    await api(`/api/recettes/${encodeURIComponent(r.id)}`, { method: 'PATCH', body: { favori: r.favori } }).catch((err) => toast(err.message));
  }
});

function afficherVerif(verif) {
  $('#a-verifier').innerHTML = verif.mots.length ? `
    <details class="repliable">
      <summary>${ic('alert')} <span>À vérifier</span> <b>${verif.mots.length}</b>${ic('chevron', 'chevron')}</summary>
      <p class="aide">Ces ingrédients ne sont pas reconnus : ils sont comptés 0,50 € et jamais pris dans le placard. Dis à quel produit ils correspondent, l'appli s'en souviendra.</p>
      <ul class="liste verifier">${verif.mots.map((m) => `
        <li>
          <span class="texte"><b>${esc(m.mot)}</b><small>${esc(m.recettes.slice(0, 2).join(', '))}${m.recettes.length > 2 ? '…' : ''}</small></span>
          <select data-mot="${esc(m.mot)}" aria-label="Produit pour ${esc(m.mot)}">
            <option value="">C'est…</option>
            ${verif.produits.map((p) => `<option>${esc(p)}</option>`).join('')}
          </select>
        </li>`).join('')}</ul>
    </details>` : '';
}

$('#a-verifier').addEventListener('change', async (e) => {
  const { mot } = e.target.dataset;
  if (!mot || !e.target.value) return;
  e.target.disabled = true;
  await api('/api/synonymes', { method: 'POST', body: { mot, produit: e.target.value } }).catch((err) => toast(err.message));
  toast(`« ${mot} » = ${e.target.value}`);
  chargerRecettes();
});

// Recherche Marmiton (ou import direct d'un lien collé)
const champRecherche = $('#recherche').q;
const estLien = (q) => /^https?:\/\//i.test(q.trim());
champRecherche.addEventListener('input', () => {
  const q = champRecherche.value;
  $('#effacer').hidden = !q;
  $('#resultats').innerHTML = estLien(q)
    ? `<button class="bouton principal large" data-importer="${esc(q.trim())}">${ic('link')} Importer cette recette</button>`
    : '';
});
$('#effacer').addEventListener('click', () => {
  champRecherche.value = '';
  champRecherche.dispatchEvent(new Event('input'));
  dire($('#message-recherche'), '');
  champRecherche.focus();
});

async function importer(url) {
  dire($('#message-recherche'), 'Récupération de la recette sur Marmiton…');
  try {
    const r = await api('/api/recettes', { method: 'POST', body: { url } });
    dire($('#message-recherche'), '');
    toast(r.deja ? `« ${r.nom} » est déjà dans tes recettes` : `« ${r.nom} » ajoutée (${r.type})`);
    await chargerRecettes();
    return true;
  } catch (err) {
    dire($('#message-recherche'), err.message);
  }
}

$('#recherche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = champRecherche.value.trim();
  if (estLien(q)) return importer(q);
  dire($('#message-recherche'), 'Recherche sur Marmiton…');
  try {
    const resultats = await api(`/api/marmiton?q=${encodeURIComponent(q)}`);
    dire($('#message-recherche'), resultats.length ? '' : 'Aucun résultat.');
    $('#resultats').innerHTML = resultats.length ? `
      <ul class="liste">${resultats.map((r) => `
        <li class="resultat">
          <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.titre)}</a>
          ${r.deja ? `<span class="puce ok">${ic('check')} Ajoutée</span>` : `<button class="bouton secondaire" data-importer="${esc(r.url)}">${ic('plus')} Ajouter</button>`}
        </li>`).join('')}</ul>` : '';
  } catch (err) {
    dire($('#message-recherche'), err.message);
  }
});

$('#resultats').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-importer]');
  if (!b) return;
  b.disabled = true;
  if (await importer(b.dataset.importer)) {
    if (b.classList.contains('large')) {
      champRecherche.value = '';
      $('#resultats').innerHTML = '';
    } else b.outerHTML = `<span class="puce ok">${ic('check')} Ajoutée</span>`;
  } else b.disabled = false;
});

// ============================================================================
// Prix
// ============================================================================
let suiviPrix, prix = [];
const SOURCES_TEXTE = {
  'Open Prices Super U': 'Super U',
  'Open Prices autre magasin': 'Autre magasin',
  'Estimation par catégorie': 'Estimation',
  'Saisi à la main': 'Mon prix',
};

async function chargerPrix() {
  const { liste, etat: e } = await api('/api/prix');
  prix = liste;
  afficherPrix();
  const p = $('#etat-prix');
  if (e.enCours) {
    p.textContent = `Actualisation : ${e.fait} / ${e.total} produits…`;
    clearTimeout(suiviPrix);
    suiviPrix = setTimeout(() => location.hash === '#prix' && chargerPrix(), 2000);
  } else if (e.erreur) p.textContent = `Erreur : ${e.erreur}`;
  else p.textContent = e.fin ? `Dernière actualisation : ${new Date(e.fin).toLocaleString('fr-FR')}` : '';
  $('#actualiser').disabled = e.enCours;
}

function afficherPrix() {
  const q = $('#recherche-prix').q.value.trim().toLowerCase();
  const visibles = prix.filter((p) => !q || p.nom.toLowerCase().includes(q));
  const anciens = prix.filter((p) => p.date && joursEntre(p.date, dateDans(0)) > 60).length;
  sousTitre(`${prix.length} produits${anciens ? ` · ${anciens} prix anciens` : ''}`);
  const groupes = Object.entries(Object.groupBy(visibles, (p) => p.rayon));
  $('#liste-prix').innerHTML = groupes.length ? groupes.map(([rayon, produits]) => `
    <div class="groupe">
      <div class="groupe-tete"><h2>${esc(rayon)}</h2></div>
      <ul class="liste">${produits.map((p) => {
        const ancien = p.date && joursEntre(p.date, dateDans(0)) > 60;
        return `
        <li>
          <button class="repas-ouvrir produit" data-produit="${esc(p.nom)}">
            <span class="repas-texte">
              <span class="repas-nom">${esc(p.nom)}</span>
              <span class="repas-meta">${SOURCES_TEXTE[p.source] || ''}${p.date ? ' · ' + jourCourt(p.date) : ''}</span>
            </span>
          </button>
          ${ancien ? '<span class="puce attention">Ancien</span>' : ''}
          <span class="prix">${p.source === ESTIME ? '≈ ' : ''}${euros(p.prix)}<small>/${esc(p.unite)}</small></span>
        </li>`;
      }).join('')}</ul>
    </div>`).join('') : '<p class="vide">Aucun produit.</p>';
}

$('#recherche-prix').addEventListener('input', afficherPrix);
$('#recherche-prix').addEventListener('submit', (e) => e.preventDefault());
$('#actualiser').addEventListener('click', async () => {
  await api('/api/prix/actualiser', { method: 'POST' });
  chargerPrix();
});

$('#liste-prix').addEventListener('click', (e) => {
  const b = e.target.closest('[data-produit]');
  if (!b) return;
  const p = prix.find((x) => x.nom === b.dataset.produit);
  ouvrirFeuille(`
    <h2 id="feuille-titre">${esc(p.nom)}</h2>
    <p class="aide">Prix actuel : ${p.source === ESTIME ? '≈ ' : ''}${euros(p.prix)} par ${esc(p.unite)} (${SOURCES_TEXTE[p.source] || p.source}${p.date ? ', ' + jourCourt(p.date) : ''}).</p>
    <form id="form-prix" class="pile" data-nom="${esc(p.nom)}">
      <label>Mon prix (€ par ${esc(p.unite)})
        <input name="prix" type="number" min="0.01" max="999" step="0.01" inputmode="decimal" required>
      </label>
      <button class="bouton principal">Enregistrer mon prix</button>
      ${p.source === 'Saisi à la main' ? '<button type="button" class="bouton discret" data-prix-auto>Revenir au prix automatique</button>' : ''}
    </form>`);
});

async function enregistrerPrix(nom, valeur) {
  try {
    await api(`/api/prix/${encodeURIComponent(nom)}`, { method: 'PUT', body: { prix: valeur } });
    fermerFeuille();
    toast(valeur === null ? 'Prix automatique remis' : 'Prix enregistré');
    chargerPrix();
  } catch (err) {
    toast(err.message);
  }
}
$('#feuille-contenu').addEventListener('submit', (e) => {
  if (e.target.id !== 'form-prix') return;
  e.preventDefault();
  enregistrerPrix(e.target.dataset.nom, Number(e.target.prix.value));
});
$('#feuille-contenu').addEventListener('click', (e) => {
  if (e.target.closest('[data-prix-auto]')) enregistrerPrix($('#form-prix').dataset.nom, null);
});

// ============================================================================
// Budget
// ============================================================================
function graphique(historique) {
  const max = Math.max(1, ...historique.flatMap((h) => [h.paye, h.prevu, h.budget])) * 1.1;
  const L = 320, H = 140, bas = 20, larg = L / historique.length;
  const y = (v) => H - bas - (v / max) * (H - bas - 8);
  return `
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="Payé et prévu par semaine, comparés au budget">
      ${historique.map((h, i) => `
        <rect class="barre-prevu" x="${i * larg + 6}" y="${y(h.prevu)}" width="${larg / 2 - 6}" height="${H - bas - y(h.prevu)}" rx="3"/>
        <rect class="barre-paye" x="${i * larg + larg / 2}" y="${y(h.paye)}" width="${larg / 2 - 6}" height="${H - bas - y(h.paye)}" rx="3"/>
        <text x="${i * larg + larg / 2}" y="${H - 4}" text-anchor="middle">${enDate(h.du).getDate()}/${enDate(h.du).getMonth() + 1}</text>`).join('')}
      <line class="ligne-budget" x1="0" x2="${L}" y1="${y(historique[0].budget)}" y2="${y(historique[0].budget)}"/>
    </svg>`;
}

async function chargerBudget() {
  const b = await api('/api/budget');
  sousTitre(`${b.periode === 'mois' ? 'Ce mois-ci' : 'Cette semaine'} · ${plage(b.debut, b.fin)}`);
  $('#synthese-budget').innerHTML = `
    <div class="synthese">
      <div class="tete">
        <div><span class="libelle">${b.reste >= 0 ? 'Reste' : 'Dépassé de'}</span><span class="grand ${niveau(b.depense, b.budget)}">${euros(Math.abs(b.reste))}</span></div>
        <div class="droite"><span class="libelle">Payé</span><b>${euros(b.depense)}</b> <small>sur ${euros(b.budget)}</small></div>
      </div>
      ${jauge(b.depense, b.budget)}
      <p class="meta">Repas prévus sur la période : ${euros(b.prevu)} estimés${b.argenx ? ` · dont ${euros(b.argenx.total)} payés par carte (Argenx)` : ''}</p>
      ${b.erreurArgenx ? `<p class="meta orange">${esc(b.erreurArgenx)}</p>` : ''}
    </div>`;
  $('#histo').innerHTML = `
    <div class="pile histo">
      <h2 class="titre-section" style="margin:0">8 dernières semaines</h2>
      ${graphique(b.historique)}
      <div class="legende"><span><i style="background:var(--texte-2);opacity:.35"></i>Prévu (repas)</span><span><i style="background:var(--accent)"></i>Payé</span><span><i style="background:var(--orange)"></i>Budget</span></div>
    </div>`;
  $('#projection').innerHTML = `
    <div class="synthese">
      <div class="tete">
        <div><span class="libelle">Fin du mois, en continuant comme ça</span><span class="grand ${niveau(b.mois.projection, b.mois.budget)}">≈ ${euros(b.mois.projection)}</span></div>
        <div class="droite"><span class="libelle">Budget du mois</span><b>${euros(b.mois.budget)}</b></div>
      </div>
      ${jauge(b.mois.projection, b.mois.budget)}
      <p class="meta">Déjà payé ce mois-ci ${euros(b.mois.paye)} + reste à acheter dans la liste.</p>
    </div>`;

  const carte = (b.argenx?.operations || []).map((o) => `
    <li><span class="texte"><b>${esc(o.libelle)}</b><small>${jourCourt(o.date)} · Revolut (Argenx)</small></span><span class="prix">${euros(o.montant)}</span></li>`).join('');
  $('#liste-depenses').innerHTML = carte + b.depenses.map((d) => `
    <li>
      <span class="texte"><b>${esc(d.libelle)}</b><small>${jourCourt(d.date)}${d.magasin ? ' · ' + esc(d.magasin) : ''}</small></span>
      <span class="prix">${euros(d.montant)}</span>
      <button class="icone-seule" data-supprimer="${esc(d.id)}" aria-label="Supprimer la dépense ${esc(d.libelle)}">${ic('trash')}</button>
    </li>`).join('');

  const f = $('#form-reglages');
  f.budget.value = b.budget;
  f.periode.value = b.periode;
  f.personnes.value = b.personnes;
  f.restes.checked = b.restes;
  f.exclusions.value = b.exclusions;
  f.sansFour.checked = b.sansFour;
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
    toast('Dépense enregistrée');
    chargerBudget();
  } catch (err) {
    dire(f, err.message);
  }
});

$('#liste-depenses').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-supprimer]');
  if (!b || !confirm('Supprimer cette dépense ?')) return;
  await api(`/api/depenses/${encodeURIComponent(b.dataset.supprimer)}`, { method: 'DELETE' }).catch((err) => toast(err.message));
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
      body: {
        budget: Number(f.budget.value), periode: f.periode.value, personnes: Number(f.personnes.value), repas,
        restes: f.restes.checked, exclusions: f.exclusions.value, sansFour: f.sansFour.checked,
      },
    });
    dire(f, '');
    toast('Réglages enregistrés : les repas sont mis à jour');
    chargerBudget();
  } catch (err) {
    dire(f, err.message);
  }
});

// ============================================================================
// Démarrage
// ============================================================================
api('/api/etat').then((e) => {
  etat = e;
  majEtat();
}).catch(() => {});
afficherOnglet();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
