// ============================================================
// CONSTANTES & ÉTAT
// ============================================================
const ALLERGENS = [
  ["A01", "Gluten"],
  ["A02", "Crustacés"],
  ["A03", "Œufs"],
  ["A04", "Poissons"],
  ["A05", "Arachides"],
  ["A06", "Soja"],
  ["A07", "Lait"],
  ["A08", "Fruits à coque"],
  ["A09", "Céleri"],
  ["A10", "Moutarde"],
  ["A11", "Sésame"],
  ["A12", "Sulfites"],
  ["A13", "Lupin"],
  ["A14", "Mollusques"]
];
const STORAGE_KEY = 'restauration-allergenes-v1';

let db = {
  aliments: [],
  recettes: [],
  menus: []
};

// ============================================================
// UTILITAIRES
// ============================================================
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function badgeHTML(ids) {
  if (!ids || !ids.length) return '<span class="ok">Aucun allergène</span>';
  return `<div class="allergenes">${ids.map(id => {
    const label = ALLERGENS.find(a => a[0] === id)?.[1] || id;
    return `<span class="badge">${esc(label)}</span>`;
  }).join('')}</div>`;
}

// Conversion du format "meta" (avec X) vers l'objet allergenes (booléens)
function convertAliment(raw) {
  const map = {
    'Gluten': 'A01', 'Crustacés': 'A02', 'Œufs': 'A03', 'Poissons': 'A04',
    'Arachides': 'A05', 'Soja': 'A06', 'Lait': 'A07', 'Fruits à coque': 'A08',
    'Céleri': 'A09', 'Moutarde': 'A10', 'Sésame': 'A11', 'Sulfites': 'A12',
    'Lupin': 'A13', 'Mollusques': 'A14'
  };
  const allergenes = {};
  if (raw.meta) {
    for (const [col, code] of Object.entries(map)) {
      allergenes[code] = (raw.meta[col] === 'X');
    }
  }
  return {
    id: raw.id,
    nom: raw.nom,
    allergenes: allergenes
  };
}

// Calcul des allergènes d'un aliment (retourne les codes présents)
function allergenesAliment(aliment) {
  if (!aliment) return [];
  return ALLERGENS
    .map(([code]) => aliment.allergenes?.[code] ? code : null)
    .filter(Boolean);
}

// Calcul des allergènes d'une recette (union de ses ingrédients)
function allergenesRecette(recette) {
  const set = new Set();
  (recette.ingredients || []).forEach(id => {
    const al = db.aliments.find(a => a.id === id);
    if (al) {
      allergenesAliment(al).forEach(code => set.add(code));
    }
  });
  return [...set];
}

// ============================================================
// CHARGEMENT INITIAL
// ============================================================
async function init() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      db = JSON.parse(saved);
    } else {
      // Charger les aliments depuis le fichier JSON
      const res = await fetch('./data/aliments.json');
      const raw = await res.json();
      db.aliments = raw.map(convertAliment);

      // Charger des recettes et menus d'exemple (si existants)
      try {
        const rRes = await fetch('./data/recettes.json');
        if (rRes.ok) {
          const recettesRaw = await rRes.json();
          db.recettes = recettesRaw;
        }
      } catch (_) {}

      try {
        const mRes = await fetch('./data/menus.json');
        if (mRes.ok) {
          const menusRaw = await mRes.json();
          db.menus = menusRaw;
        }
      } catch (_) {}

      save();
    }
  } catch (e) {
    console.error('Erreur chargement initial:', e);
  }

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Cacher le loader
  document.getElementById('loader').classList.add('hide');

  // Lancer le routage
  route();
  window.addEventListener('hashchange', route);

  // Navigation par clic sur les boutons
  document.querySelectorAll('#bottom-nav button[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.view;
    });
  });
}

// ============================================================
// ROUTEUR
// ============================================================
function route() {
  const view = location.hash.slice(1) || 'dashboard';
  // Marquer le bouton actif
  document.querySelectorAll('#bottom-nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  render(view);
}

// ============================================================
// RENDU DES VUES
// ============================================================
function render(view) {
  const app = document.getElementById('app');
  switch (view) {
    case 'aliments': return alimentsView(app);
    case 'recettes': return recettesView(app);
    case 'menus': return menusView(app);
    case 'sauvegarde': return backupView(app);
    default: return dashboardView(app);
  }
}

// --- ACCUEIL ---
function dashboardView(app) {
  app.innerHTML = `
    <div class="grid">
      <div class="card"><div class="stat">${db.aliments.length}</div><div>Aliments</div></div>
      <div class="card"><div class="stat">${db.recettes.length}</div><div>Recettes</div></div>
      <div class="card"><div class="stat">${db.menus.length}</div><div>Menus</div></div>
    </div>
    <div class="card">
      <h2>Principe</h2>
      <p>Les allergènes d'une recette sont calculés à partir de ses ingrédients. Les données restent dans ce navigateur et peuvent être sauvegardées/exportées.</p>
      <div class="row" style="margin-top:12px">
        <button class="primary" data-view="aliments">Gérer les aliments</button>
        <button data-view="recettes">Gérer les recettes</button>
        <button data-view="menus">Construire un menu</button>
      </div>
    </div>
  `;
}

// --- ALIMENTS ---
function alimentsView(app) {
  app.innerHTML = `
    <div class="card">
      <div class="row">
        <div style="flex:1"><input id="aq" placeholder="Rechercher un aliment…" /></div>
        <button class="primary" id="newA">+ Ajouter</button>
      </div>
    </div>
    <div class="card">
      <div id="alist" class="list"></div>
    </div>
  `;
  document.getElementById('aq').oninput = drawA;
  document.getElementById('newA').onclick = () => editAliment();
  drawA();
}

function drawA() {
  const q = document.getElementById('aq').value.toLowerCase();
  const list = document.getElementById('alist');
  const filtered = db.aliments.filter(a => a.nom.toLowerCase().includes(q));
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">Aucun résultat.</p>';
    return;
  }
  list.innerHTML = filtered.map(a => `
    <div class="item">
      <div>
        <b>${esc(a.nom)}</b>
        ${badgeHTML(allergenesAliment(a))}
      </div>
      <div>
        <button onclick="editAliment('${a.id}')">Modifier</button>
        <button class="danger" onclick="delAliment('${a.id}')">Supprimer</button>
      </div>
    </div>
  `).join('');
}

window.editAliment = function(id) {
  const existing = id ? db.aliments.find(a => a.id === id) : null;
  const data = existing ? { ...existing } : { nom: '', allergenes: {} };
  // Pour les cases à cocher
  const checkboxes = ALLERGENS.map(([code, label]) => `
    <label>
      <input type="checkbox" id="a_${code}" ${data.allergenes?.[code] ? 'checked' : ''} />
      ${esc(label)}
    </label>
  `).join('');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card">
      <h2>${id ? 'Modifier' : 'Ajouter'} un aliment</h2>
      <div class="field">
        <label>Nom</label>
        <input id="an" value="${esc(data.nom)}" />
      </div>
      <h3>Allergènes</h3>
      <div class="checkgrid">${checkboxes}</div>
      <div class="row" style="margin-top:16px">
        <button class="primary" id="saveA">Enregistrer</button>
        <button data-view="aliments">Annuler</button>
      </div>
    </div>
  `;

  document.getElementById('saveA').onclick = () => {
    const nom = document.getElementById('an').value.trim();
    if (!nom) return alert('Le nom est obligatoire.');
    const allergenes = {};
    ALLERGENS.forEach(([code]) => {
      allergenes[code] = document.getElementById(`a_${code}`).checked;
    });
    const newAliment = {
      id: id || ('a-' + Date.now()),
      nom,
      allergenes
    };
    const idx = db.aliments.findIndex(a => a.id === newAliment.id);
    if (idx >= 0) db.aliments[idx] = newAliment;
    else db.aliments.push(newAliment);
    save();
    location.hash = 'aliments';
  };
};

window.delAliment = function(id) {
  // Vérifier si utilisé dans une recette
  if (db.recettes.some(r => (r.ingredients || []).includes(id))) {
    return alert('Cet aliment est utilisé dans une recette, suppression impossible.');
  }
  if (confirm('Supprimer cet aliment définitivement ?')) {
    db.aliments = db.aliments.filter(a => a.id !== id);
    save();
    drawA();
  }
};

// --- RECETTES ---
function recettesView(app) {
  app.innerHTML = `
    <div class="card">
      <div class="row">
        <div style="flex:1"><input id="rq" placeholder="Rechercher une recette…" /></div>
        <button class="primary" id="newR">+ Ajouter</button>
      </div>
    </div>
    <div class="card">
      <div id="rlist" class="list"></div>
    </div>
  `;
  document.getElementById('rq').oninput = drawR;
  document.getElementById('newR').onclick = () => editRecette();
  drawR();
}

function drawR() {
  const q = document.getElementById('rq').value.toLowerCase();
  const list = document.getElementById('rlist');
  const filtered = db.recettes.filter(r => r.nom.toLowerCase().includes(q));
  if (!filtered.length) {
    list.innerHTML = '<p class="muted">Aucune recette.</p>';
    return;
  }
  list.innerHTML = filtered.map(r => `
    <div class="item">
      <div>
        <b>${esc(r.nom)}</b>
        ${badgeHTML(allergenesRecette(r))}
        <div class="muted">${(r.ingredients || []).map(id => {
          const a = db.aliments.find(al => al.id === id);
          return a ? esc(a.nom) : '?';
        }).join(', ')}</div>
      </div>
      <div>
        <button onclick="editRecette('${r.id}')">Modifier</button>
        <button class="danger" onclick="delRecette('${r.id}')">Supprimer</button>
      </div>
    </div>
  `).join('');
}

window.editRecette = function(id) {
  const existing = id ? db.recettes.find(r => r.id === id) : null;
  const data = existing ? { ...existing } : { nom: '', ingredients: [] };
  const app = document.getElementById('app');

  // Générer la liste des ingrédients avec cases à cocher
  const ingCheckboxes = db.aliments.map(a => `
    <label class="ing">
      <input type="checkbox" value="${a.id}" ${data.ingredients.includes(a.id) ? 'checked' : ''} />
      ${esc(a.nom)}
    </label>
  `).join('');

  app.innerHTML = `
    <div class="card">
      <h2>${id ? 'Modifier' : 'Ajouter'} une recette</h2>
      <div class="field">
        <label>Nom</label>
        <input id="rn" value="${esc(data.nom)}" />
      </div>
      <label>Ingrédients</label>
      <input id="iq" placeholder="Filtrer les aliments…" />
      <div id="ichk" class="checkgrid">${ingCheckboxes}</div>
      <div class="card" style="margin-top:12px">
        <b>Allergènes calculés :</b>
        <span id="rprev"></span>
      </div>
      <div class="row" style="margin-top:16px">
        <button class="primary" id="saveR">Enregistrer</button>
        <button data-view="recettes">Annuler</button>
      </div>
    </div>
  `;

  // Filtre des ingrédients
  document.getElementById('iq').oninput = e => {
    const val = e.target.value.toLowerCase();
    document.querySelectorAll('.ing').forEach(label => {
      label.style.display = label.textContent.toLowerCase().includes(val) ? 'block' : 'none';
    });
  };

  // Mise à jour en direct des allergènes
  function updatePreview() {
    const checked = [...document.querySelectorAll('#ichk input:checked')].map(inp => inp.value);
    const set = new Set();
    checked.forEach(id => {
      const al = db.aliments.find(a => a.id === id);
      if (al) allergenesAliment(al).forEach(code => set.add(code));
    });
    document.getElementById('rprev').innerHTML = badgeHTML([...set]);
  }
  document.querySelectorAll('#ichk input').forEach(inp => inp.onchange = updatePreview);
  updatePreview();

  document.getElementById('saveR').onclick = () => {
    const nom = document.getElementById('rn').value.trim();
    if (!nom) return alert('Le nom est obligatoire.');
    const ingredients = [...document.querySelectorAll('#ichk input:checked')].map(inp => inp.value);
    const newRecette = {
      id: id || ('r-' + Date.now()),
      nom,
      ingredients
    };
    const idx = db.recettes.findIndex(r => r.id === newRecette.id);
    if (idx >= 0) db.recettes[idx] = newRecette;
    else db.recettes.push(newRecette);
    save();
    location.hash = 'recettes';
  };
};

window.delRecette = function(id) {
  if (confirm('Supprimer cette recette ?')) {
    db.recettes = db.recettes.filter(r => r.id !== id);
    save();
    drawR();
  }
};

// --- MENUS ---
function menusView(app) {
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  const lastMenu = db.menus.at(-1);
  const menuName = lastMenu ? lastMenu.nom : '';

  // Options pour les selects (recettes)
  const opt = db.recettes.map(r => `<option value="${r.id}">${esc(r.nom)}</option>`).join('');

  let html = `
    <div class="card">
      <div class="row">
        <div style="flex:1">
          <input id="mn" placeholder="Nom de la semaine / période" value="${esc(menuName)}" />
        </div>
        <button class="primary" id="saveM">Enregistrer la semaine</button>
      </div>
    </div>
  `;

  days.forEach((day, i) => {
    // Essayer de charger les valeurs du dernier menu enregistré
    const savedDay = lastMenu ? lastMenu.jours?.find(j => j.jour === day) : null;
    const entree = savedDay?.entree || '';
    const plat = savedDay?.plat || '';
    const garniture = savedDay?.garniture || '';
    const dessert = savedDay?.dessert || '';

    html += `
      <div class="day">
        <h3>${day}</h3>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap:8px;">
          <div>
            <label>Entrée</label>
            <select class="mc" data-d="${i}" data-type="entree">
              <option value="">—</option>
              ${opt}
            </select>
          </div>
          <div>
            <label>Plat</label>
            <select class="mc" data-d="${i}" data-type="plat">
              <option value="">—</option>
              ${opt}
            </select>
          </div>
          <div>
            <label>Accompagnement</label>
            <select class="mc" data-d="${i}" data-type="garniture">
              <option value="">—</option>
              ${opt}
            </select>
          </div>
          <div>
            <label>Dessert</label>
            <select class="mc" data-d="${i}" data-type="dessert">
              <option value="">—</option>
              ${opt}
            </select>
          </div>
        </div>
        <div id="ma${i}" class="muted" style="margin-top:8px"></div>
      </div>
    `;
  });

  app.innerHTML = html;

  // Pré-remplir les selects avec les valeurs sauvegardées
  days.forEach((day, i) => {
    const savedDay = lastMenu ? lastMenu.jours?.find(j => j.jour === day) : null;
    if (savedDay) {
      document.querySelector(`select[data-d="${i}"][data-type="entree"]`).value = savedDay.entree || '';
      document.querySelector(`select[data-d="${i}"][data-type="plat"]`).value = savedDay.plat || '';
      document.querySelector(`select[data-d="${i}"][data-type="garniture"]`).value = savedDay.garniture || '';
      document.querySelector(`select[data-d="${i}"][data-type="dessert"]`).value = savedDay.dessert || '';
    }
    // Mettre à jour l'aperçu
    menuPreview(i);
  });

  // Événements pour l'aperçu
  document.querySelectorAll('.mc').forEach(sel => {
    sel.onchange = () => menuPreview(sel.dataset.d);
  });

  document.getElementById('saveM').onclick = () => {
    const nom = document.getElementById('mn').value.trim() || 'Semaine';
    const jours = days.map((jour, i) => {
      const obj = { jour };
      document.querySelectorAll(`select[data-d="${i}"]`).forEach(sel => {
        obj[sel.dataset.type] = sel.value;
      });
      return obj;
    });
    db.menus.push({ id: 'm-' + Date.now(), nom, jours });
    save();
    alert('Semaine enregistrée !');
    location.hash = 'menus';
  };
}

function menuPreview(i) {
  const selects = document.querySelectorAll(`select[data-d="${i}"]`);
  const ids = [...selects].map(sel => sel.value).filter(Boolean);
  const set = new Set();
  ids.forEach(id => {
    const recette = db.recettes.find(r => r.id === id);
    if (recette) allergenesRecette(recette).forEach(code => set.add(code));
  });
  const div = document.getElementById(`ma${i}`);
  if (set.size) {
    div.innerHTML = `<b>Allergènes :</b> ${badgeHTML([...set])}`;
  } else {
    div.innerHTML = 'Aucun allergène détecté.';
  }
}

// --- SAUVEGARDE ---
function backupView(app) {
  app.innerHTML = `
    <div class="card">
      <h2>Sauvegarde locale</h2>
      <p>Les données sont stockées dans le navigateur. Faites régulièrement une exportation JSON.</p>
      <div class="row">
        <button class="primary" id="export">📤 Exporter</button>
        <label style="padding:10px 14px;background:#e9eef3;border-radius:10px;cursor:pointer;">
          📥 Importer
          <input id="imp" type="file" accept=".json" style="display:none" />
        </label>
        <button class="danger" id="reset">🗑️ Réinitialiser</button>
      </div>
    </div>
  `;

  document.getElementById('export').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'allergenes-sauvegarde.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('imp').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.aliments && data.recettes !== undefined && data.menus !== undefined) {
          db = data;
          save();
          alert('Import réussi !');
          route();
        } else {
          alert('Format de fichier invalide.');
        }
      } catch (err) {
        alert('Erreur lors de la lecture du fichier.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  document.getElementById('reset').onclick = () => {
    if (confirm('Effacer toutes les données locales ?')) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  };
}

// ============================================================
// DÉMARRAGE
// ============================================================
init();