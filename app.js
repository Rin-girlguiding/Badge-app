// ============================================================
// Badge Tracker — app.js
// A small hash-routed app. No framework: each route renders a
// string of HTML into #main, then wires up its own event
// listeners. STATE holds everything currently loaded.
// ============================================================

let STATE = null; // { members, statuses, inventory, extraBadgeNames, masterBadges }
const $main = () => document.getElementById('main');
const $tabbar = () => document.getElementById('tabbar');
const $topbar = () => document.getElementById('topbar');

async function boot() {
  const data = await DB.getAll();
  STATE = {
    ...data,
    masterBadges: buildMasterBadgeList(data.extraBadgeNames, data.extraBadgeCategories),
  };
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/home';
  render();
}

async function refreshState() {
  const data = await DB.getAll();
  STATE.members = data.members;
  STATE.statuses = data.statuses;
  STATE.inventory = data.inventory;
  STATE.extraBadgeNames = data.extraBadgeNames;
  STATE.extraBadgeCategories = data.extraBadgeCategories;
  STATE.masterBadges = buildMasterBadgeList(data.extraBadgeNames, data.extraBadgeCategories);
}

// ---------- Small helpers ----------

function badgeById(id) { return STATE.masterBadges.find(b => b.id === id); }
function statusEntry(memberId, badgeId) { return STATE.statuses[`${memberId}|${badgeId}`]; }

// The RAW stored status only — what was actually written to the store,
// with no cascade logic applied. Used internally by the cascade
// calculations themselves, and for deciding what to write on a toggle.
function rawStatusOf(memberId, badgeId) { return (statusEntry(memberId, badgeId) || {}).status || 'not_gained'; }

// The status to actually DISPLAY/COUNT anywhere in the app. For Skill,
// Interest, and Extra badges this is just the raw stored status. For
// Theme awards and Top awards (Bronze/Silver/Gold), it's cascade-computed
// from their prerequisites — UNLESS she's manually confirmed "Gained",
// which always wins and is the only way these ever reach "Gained".
function statusOf(memberId, badgeId) {
  const badge = badgeById(badgeId);
  if (!badge) return rawStatusOf(memberId, badgeId);
  if (badge.type === 'theme') return themeCascadeStatus(memberId, badge.theme);
  if (badge.type === 'award') return awardCascadeStatus(memberId, badge.name);
  return rawStatusOf(memberId, badgeId);
}

function themeHasOrOwed(memberId, themeId, kind) {
  return STATE.masterBadges.some(b => b.type === kind && b.theme === themeId &&
    (rawStatusOf(memberId, b.id) === 'has' || rawStatusOf(memberId, b.id) === 'owed'));
}

function themeCascadeStatus(memberId, themeId) {
  if (rawStatusOf(memberId, `theme_${themeId}`) === 'has') return 'has'; // manual confirmation is sticky
  const skillProgress = themeHasOrOwed(memberId, themeId, 'skill');
  const interestProgress = themeHasOrOwed(memberId, themeId, 'interest');
  return (skillProgress && interestProgress) ? 'owed' : 'not_gained';
}

const AWARD_THRESHOLDS = { Bronze: 2, Silver: 4, Gold: 6 };

function awardCascadeStatus(memberId, awardName) {
  const id = `award_${slug(awardName)}`;
  if (rawStatusOf(memberId, id) === 'has') return 'has'; // manual confirmation is sticky
  const threshold = AWARD_THRESHOLDS[awardName];
  if (!threshold) return 'not_gained';
  const themesHasOrOwed = THEMES.filter(t => {
    const s = themeCascadeStatus(memberId, t.id);
    return s === 'has' || s === 'owed';
  }).length;
  return themesHasOrOwed >= threshold ? 'owed' : 'not_gained';
}

// Toggle a Theme/Award badge between manually-confirmed "Gained" and
// "back to automatic" (whatever the cascade currently computes).
async function toggleManualGained(memberId, badgeId) {
  const isManuallyGained = rawStatusOf(memberId, badgeId) === 'has';
  await DB.setStatus(memberId, badgeId, isManuallyGained ? 'not_gained' : 'has', {});
  await refreshState();
}

function memberById(id) { return STATE.members.find(m => m.id === id); }
function inventoryOf(badgeId) { return STATE.inventory[badgeId] || { stock: 0, onOrder: 0 }; }

function countByStatus(badgeId, status) {
  return STATE.members.filter(m => statusOf(m.id, badgeId) === status).length;
}

function themeAwardCount(memberId) {
  return THEMES.filter(t => statusOf(memberId, `theme_${t.id}`) === 'has').length;
}

function shapeClassFor(badge) {
  if (badge.type === 'interest') return 'shape-square';
  if (badge.type === 'skill') return 'shape-hex';
  if (badge.type === 'theme') return 'shape-shield';
  return 'shape-circle'; // award, extra — unthemed
}
function shapeColorFor(badge) {
  return badge.theme ? themeById(badge.theme).color : '#9AA0AA';
}

function statusDateLabel(memberId, badgeId) {
  const entry = statusEntry(memberId, badgeId); // raw — cascade-only 'owed' has no entry, so no label
  if (!entry || !['has', 'owed', 'partial'].includes(entry.status)) return '';
  if (!entry.updatedAt || entry.updatedAt < IMPORT_CUTOFF) return 'Imported';
  const d = new Date(entry.updatedAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}-${yy}`;
}

function pillHtml(status, dateLabel) {
  const meta = STATUS_META[status];
  const suffix = dateLabel ? ` ${dateLabel}` : '';
  return `<span class="pill" style="color:${meta.color};background:${meta.bg}">${meta.label}${suffix}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Router ----------

function currentRoute() {
  const hash = location.hash.replace(/^#\//, '');
  return hash.split('/').filter(Boolean);
}

function go(path) { location.hash = '#/' + path; }

function render() {
  const parts = currentRoute();
  const section = parts[0] || 'home';
  renderTabbar(section);

  if (section === 'home') return renderHome();
  if (section === 'badges') return renderBadgesRoute(parts.slice(1));
  if (section === 'members') return renderMembersRoute(parts.slice(1));
  if (section === 'inventory') return renderInventoryRoute(parts.slice(1));
  renderHome();
}

function renderTabbar(active) {
  $tabbar().innerHTML = `
    <button data-go="home" class="${active === 'home' ? 'active' : ''}"><span class="dot"></span>Home</button>
    <button data-go="badges" class="${active === 'badges' ? 'active' : ''}"><span class="dot"></span>Badges</button>
    <button data-go="members" class="${active === 'members' ? 'active' : ''}"><span class="dot"></span>Members</button>
    <button data-go="inventory" class="${active === 'inventory' ? 'active' : ''}"><span class="dot"></span>Inventory</button>
  `;
  $tabbar().querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.go));
}

function setTopbar(title, onBack) {
  $topbar().innerHTML = `
    ${onBack ? `<button class="back">‹ Back</button>` : `<span></span>`}
    <h1>${title}</h1>
    <span style="width:40px"></span>
  `;
  if (onBack) $topbar().querySelector('.back').onclick = onBack;
}

// ============================================================
// HOME
// ============================================================

function renderHome() {
  setTopbar('', null);

  const { owed, unconfirmed, onOrder } = computeOwedAndOnOrder();

  $main().innerHTML = `
    <div class="home-masthead">
      <div class="home-logo-circle" id="logoCircle">
        <img src="assets/girlguiding-logo.png" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <span class="logo-placeholder">Logo<br>goes here</span>
      </div>
      <h1 class="app-title" id="appTitle">1st Hucclecote Badge Tracker</h1>
      <p class="home-subtitle">
        Badges last updated: ${formatLastUpdated(overallLastUpdated(STATE.statuses))}<br>
        Inventory last updated: ${formatLastUpdated(overallLastUpdated(STATE.inventory))}
      </p>
    </div>

    <div class="home-hero">
      <h2>Hiya! 👋</h2>
      <p class="muted">Here's what's outstanding right now.</p>
    </div>

    ${considerPlanningCardHtml()}

    ${actionListHtml('Currently owed', owed, 'owed')}
    ${actionListHtml('Unconfirmed', unconfirmed, 'unconfirmed')}
    ${actionListHtml('On order', onOrder, 'on order')}

    <div class="btn-row" style="margin-top:6px;">
      <button class="link-row" id="exportData">Export data</button>
      <button class="link-row" id="resetData">Reset app data (start fresh)</button>
    </div>
  `;
  document.querySelectorAll('[data-jump]').forEach(el => el.onclick = () => go(`badges/detail/${el.dataset.jump}`));
  document.getElementById('exportData').onclick = () => DB.exportData();
  document.getElementById('resetData').onclick = async () => {
    if (confirm('This clears everything in this browser (members, statuses, inventory) and reloads. Use this to start fresh or to pick up new seed data. Continue?')) {
      localStorage.removeItem(LOCAL_KEY);
      location.reload();
    }
  };

  // Size the logo circle to roughly half the rendered width of the title text.
  requestAnimationFrame(() => {
    const titleEl = document.getElementById('appTitle');
    const circle = document.getElementById('logoCircle');
    if (titleEl && circle) {
      const size = Math.max(48, Math.round(titleEl.offsetWidth / 2));
      circle.style.width = size + 'px';
      circle.style.height = size + 'px';
    }
  });
}

// ============================================================
// BADGE VIEW
// ============================================================

function renderBadgesRoute(parts) {
  if (parts[0] === 'table') return renderFullTable();
  if (parts[0] === 'detail' && parts[1]) return renderBadgeDetail(parts[1]);
  return renderBadgesHome();
}

function considerPlanningData() {
  // Theme-level suggestion: which theme has the most girls with ZERO
  // progress on either Skills track (neither started) — not individual
  // badge instances like "Reflect 3".
  const themeStats = THEMES.map(t => {
    const missing = STATE.members.filter(m => !themeHasOrOwed(m.id, t.id, 'skill')).length;
    return { theme: t, missing, oldest: themeOldestSkillUpdate(t.id) };
  }).filter(x => x.missing > 0);
  themeStats.sort((a, b) => b.missing - a.missing || (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0));

  // Proximity: only girls one theme away from GOLD specifically, and only
  // when what's blocking them is the Skills badge (the one that has to
  // happen in a meeting).
  const goldProximity = [];
  STATE.members.forEach(m => {
    const doneThemeIds = THEMES.filter(t => statusOf(m.id, `theme_${t.id}`) === 'has').map(t => t.id);
    if (doneThemeIds.length === 5) {
      const remaining = THEMES.find(t => !doneThemeIds.includes(t.id));
      if (remaining && !themeHasOrOwed(m.id, remaining.id, 'skill')) {
        goldProximity.push(`${escapeHtml(m.name)} just needs a ${remaining.name} Skills badge for Gold`);
      }
    }
  });

  return { themeStats, goldProximity };
}

function themeOldestSkillUpdate(themeId) {
  const dates = STATE.masterBadges
    .filter(b => b.type === 'skill' && b.theme === themeId)
    .map(b => inventoryOf(b.id).lastUpdated || '');
  return dates.sort()[0] || ''; // '' (never updated) sorts as "oldest"
}

function considerPlanningCardHtml() {
  const { themeStats, goldProximity } = considerPlanningData();
  const themeSuggestion = themeStats[0] || null;
  const runnersUp = themeStats.slice(1, 3);
  const shown = goldProximity.slice(0, 3);
  const more = goldProximity.length - shown.length;
  if (!themeSuggestion && shown.length === 0) return '';
  return `
    <div class="card">
      <div class="card-title">Consider planning</div>
      ${themeSuggestion ? `
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <div class="badge-shape shape-shield solid-fill" style="--shape-color:${themeSuggestion.theme.color}; width:34px; height:34px; margin:2px 0 0 0; flex-shrink:0;"></div>
          <p style="margin:0;">Consider planning activities from the <strong>${escapeHtml(themeSuggestion.theme.name)}</strong> theme — ${themeSuggestion.missing} ${themeSuggestion.missing === 1 ? "girl hasn't" : "girls haven't"} started either Skills badge yet.</p>
        </div>
        ${runnersUp.length ? `<p class="muted" style="font-size:11.5px; font-style:italic; margin:6px 0 0 44px;">Also high priority: ${runnersUp.map(r => escapeHtml(r.theme.name)).join(' and ')}</p>` : ''}` : ''}
      ${shown.length ? `<p class="muted" style="margin-top:8px">Close to Gold:</p>
        <ul style="margin:4px 0 0 18px; padding:0; font-size:13.5px;">
          ${shown.map(s => `<li>${s}</li>`).join('')}
        </ul>
        ${more > 0 ? `<p class="muted">+${more} more</p>` : ''}` : ''}
    </div>`;
}

function renderBadgesHome() {
  setTopbar('Badges', null);
  const owedBadges = STATE.masterBadges
    .map(b => ({ b, n: countByStatus(b.id, 'owed') }))
    .filter(x => x.n > 0)
    .sort((a, b2) => b2.n - a.n);

  $main().innerHTML = `
    <div class="card">
      <div class="card-title">Quick action</div>
      ${owedBadges.length === 0 ? `<p class="muted">Nothing owed right now.</p>` :
        owedBadges.map(x => `
          <div class="roster-row" style="cursor:pointer;" data-jump="${x.b.id}">
            <span>${escapeHtml(x.b.name)} — Owed</span>
            <span class="muted">${x.n}</span>
          </div>`).join('')}
    </div>

    <button class="link-row" data-go="badges/table">View full table (all badges × all members)</button>

    <div class="card">
      <div class="card-title">Choose a badge</div>
      <div id="selector"></div>
    </div>
  `;
  $main().querySelector('[data-go]').onclick = () => go('badges/table');
  document.querySelectorAll('[data-jump]').forEach(el => el.onclick = () => go(`badges/detail/${el.dataset.jump}`));
  renderBadgeSelector(document.getElementById('selector'), (badgeId) => go(`badges/detail/${badgeId}`));
}

// Reusable click-through badge selector: a chain of dropdowns.
// Picking one option auto-reveals the next; changing an earlier
// dropdown resets everything after it. Picking the final badge
// fires onPick immediately.
const ADD_NEW_EXTRA = '__add_new__';

function renderBadgeSelector(container, onPick, opts) {
  opts = opts || {};
  let sel = { category: '', theme: '', kind: '' };

  function selectHtml(id, label, options, value) {
    return `
      <div class="field">
        <label>${label}</label>
        <select id="${id}">
          <option value="">Choose…</option>
          ${options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>`;
  }

  function draw() {
    const categoryOptions = [
      { value: 'theme', label: 'Theme badges (Skill / Interest)' },
      { value: 'award', label: 'Award (Bronze / Silver / Gold)' },
      { value: 'extra', label: 'Extra' },
    ].filter(o => !(opts.hideAward && o.value === 'award'));
    let html = selectHtml('selCategory', 'Type', categoryOptions, sel.category);

    if (sel.category === 'theme') {
      html += selectHtml('selTheme', 'Theme', THEMES.map(t => ({ value: t.id, label: t.name })), sel.theme);
      if (sel.theme) {
        html += selectHtml('selKind', 'Skill or Interest', [
          { value: 'skill', label: 'Skill' },
          { value: 'interest', label: 'Interest' },
        ], sel.kind);
        if (sel.kind) {
          const options = STATE.masterBadges.filter(b => b.type === sel.kind && b.theme === sel.theme)
            .map(b => ({ value: b.id, label: b.name }));
          html += selectHtml('selBadge', 'Badge', options, '');
        }
      }
    } else if (sel.category === 'award') {
      const options = STATE.masterBadges.filter(b => b.type === 'award').map(b => ({ value: b.id, label: b.name }));
      html += selectHtml('selBadge', 'Award', options, '');
    } else if (sel.category === 'extra') {
      html += selectHtml('selExtraCat', 'Extra category', EXTRA_CATEGORIES.map(c => ({ value: c.id, label: c.name })), sel.extraCat);
      if (sel.extraCat) {
        const options = STATE.masterBadges.filter(b => b.type === 'extra' && b.subcategory === sel.extraCat)
          .map(b => ({ value: b.id, label: b.name }));
        options.push({ value: ADD_NEW_EXTRA, label: '+ Add a new Extra badge…' });
        html += selectHtml('selBadge', 'Extra badge', options, '');
      }
    }

    container.innerHTML = html;

    container.querySelector('#selCategory').onchange = (e) => {
      sel = { category: e.target.value, theme: '', kind: '' };
      draw();
    };
    const tSel = container.querySelector('#selTheme');
    if (tSel) tSel.onchange = (e) => { sel.theme = e.target.value; sel.kind = ''; draw(); };
    const kSel = container.querySelector('#selKind');
    if (kSel) kSel.onchange = (e) => { sel.kind = e.target.value; draw(); };
    const ecSel = container.querySelector('#selExtraCat');
    if (ecSel) ecSel.onchange = (e) => { sel.extraCat = e.target.value; draw(); };
    const bSel = container.querySelector('#selBadge');
    if (bSel) bSel.onchange = async (e) => {
      if (e.target.value === ADD_NEW_EXTRA) {
        const id = await promptAddExtraBadge(sel.extraCat);
        if (id) onPick(id); else draw();
        return;
      }
      if (e.target.value) onPick(e.target.value);
    };
  }

  draw();
}

async function promptAddExtraBadge(category) {
  const name = prompt('Name of the new Extra badge:');
  if (!name) return null;
  const stock = parseInt(prompt('Starting stock (leave blank for 0):') || '0', 10) || 0;
  const onOrder = parseInt(prompt('Starting "on order" quantity (leave blank for 0):') || '0', 10) || 0;
  const id = await DB.addExtraBadge(name.trim(), stock, onOrder, category);
  await refreshState();
  return id;
}

function renderBadgeDetail(badgeId) {
  const badge = badgeById(badgeId);
  setTopbar(badge ? badge.name : 'Badge', () => go('badges'));
  if (!badge) { $main().innerHTML = `<p class="muted">Badge not found.</p>`; return; }
  const isAutomatic = badge.type === 'theme' || badge.type === 'award';

  const rows = STATE.members.map(m => ({ m, status: statusOf(m.id, badge.id) }))
    .sort((a, b) => {
      if (a.status === 'has' && b.status !== 'has') return 1;
      if (b.status === 'has' && a.status !== 'has') return -1;
      return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
    });

  $main().innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="badge-shape ${shapeClassFor(badge)}" style="--shape-color:${shapeColorFor(badge)}"></div>
      <div class="card-title" style="text-align:center">${escapeHtml(badge.name)}</div>
      <p class="muted">${badge.type === 'skill' ? 'Skills badge' : badge.type === 'interest' ? 'Interest badge' : badge.type === 'theme' ? 'Theme award' : badge.type === 'award' ? 'Top award' : 'Extra badge'}</p>
    </div>

    <div class="card">
      <div class="btn-row" style="margin-bottom:10px;">
        <button class="btn" id="selectAll">Select all</button>
        <button class="btn" id="clearSel">Clear</button>
      </div>
      <div id="roster">
        ${rows.map(r => `
          <div class="roster-row">
            <label class="roster-name">
              <span class="checkbox" data-check="${r.m.id}"></span>
              <a data-member="${r.m.id}">${escapeHtml(r.m.name)}</a>
            </label>
            ${pillHtml(r.status, statusDateLabel(r.m.id, badge.id))}
          </div>
        `).join('')}
      </div>
      ${isAutomatic
        ? `<p class="muted" style="margin-top:10px; font-size:12.5px;">This one's tracked automatically from its prerequisites. The only manual action is confirming it's been given:</p>
           <div class="btn-row" style="margin-top:6px;"><button class="btn" data-apply="has">Mark selected as Gained</button></div>`
        : `<div class="btn-row" style="margin-top:12px;">
             ${STATUSES.map(s => `<button class="btn" data-apply="${s}">${STATUS_META[s].label}</button>`).join('')}
           </div>`}
    </div>
  `;

  const selected = new Set();
  document.getElementById('roster').querySelectorAll('[data-check]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const id = el.dataset.check;
      if (selected.has(id)) { selected.delete(id); el.classList.remove('checked'); }
      else { selected.add(id); el.classList.add('checked'); }
    };
  });
  document.getElementById('selectAll').onclick = () => {
    selected.clear();
    STATE.members.forEach(m => selected.add(m.id));
    document.querySelectorAll('[data-check]').forEach(el => el.classList.add('checked'));
  };
  document.getElementById('clearSel').onclick = () => {
    selected.clear();
    document.querySelectorAll('[data-check]').forEach(el => el.classList.remove('checked'));
  };
  document.querySelectorAll('[data-member]').forEach(a => a.onclick = () => go(`members/detail/${a.dataset.member}`));
  document.querySelectorAll('[data-apply]').forEach(btn => btn.onclick = async () => {
    if (selected.size === 0) { alert('Select at least one girl first.'); return; }
    await DB.bulkSetStatus([...selected], badge.id, btn.dataset.apply);
    await refreshState();
    renderBadgeDetail(badgeId);
  });
}

function renderFullTable() {
  setTopbar('Full table', () => go('badges'));
  const badges = STATE.masterBadges.filter(b => b.type !== 'extra' || inventoryOf(b.id));
  $main().innerHTML = `<div class="full-table-wrap"><table class="full-table">
    <thead><tr><th>Badge</th>${STATE.members.map(m => `<th>${escapeHtml(m.name)}</th>`).join('')}</tr></thead>
    <tbody>
      ${badges.map(b => `<tr><td>${escapeHtml(b.name)}</td>${STATE.members.map(m => {
        const s = statusOf(m.id, b.id);
        return `<td style="color:${STATUS_META[s].color}">${STATUS_META[s].label}</td>`;
      }).join('')}</tr>`).join('')}
    </tbody>
  </table></div>`;
}

// ============================================================
// MEMBER VIEW
// ============================================================

function renderMembersRoute(parts) {
  if (parts[0] === 'detail' && parts[1]) return renderMemberDetail(parts[1]);
  return renderMembersHome();
}

function renderMembersHome() {
  setTopbar('Members', null);
  $main().innerHTML = `
    <div class="card">
      <div class="field">
        <label>Search for a member</label>
        <input type="text" id="search" placeholder="Type a name…" />
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="addBtn">+ Add</button>
        <button class="btn btn-danger" id="delBtn">Delete</button>
      </div>
    </div>
    <div id="results"></div>
  `;

  function drawResults(filter) {
    const list = STATE.members.filter(m => m.name.toLowerCase().includes((filter || '').toLowerCase()));
    document.getElementById('results').innerHTML = list.length === 0
      ? `<p class="muted">No members ${filter ? 'match that search' : 'yet — add your first guide above'}.</p>`
      : list.map(m => `<div class="roster-row"><a data-open="${m.id}" style="cursor:pointer">${escapeHtml(m.name)}</a></div>`).join('');
    document.querySelectorAll('[data-open]').forEach(a => a.onclick = () => go(`members/detail/${a.dataset.open}`));
  }
  drawResults('');
  document.getElementById('search').oninput = (e) => drawResults(e.target.value);

  document.getElementById('addBtn').onclick = async () => {
    const name = prompt('Guide\'s name:');
    if (name && name.trim()) {
      await DB.saveMember({ name: name.trim() });
      await refreshState();
      renderMembersHome();
    }
  };
  document.getElementById('delBtn').onclick = async () => {
    const name = prompt('Type the exact name of the guide to delete:');
    const match = STATE.members.find(m => m.name.toLowerCase() === (name || '').toLowerCase());
    if (!match) { if (name) alert('No exact match found.'); return; }
    if (confirm(`Permanently delete ${match.name} and all her badge data? This can't be undone.`)) {
      await DB.deleteMember(match.id);
      await refreshState();
      renderMembersHome();
    }
  };
}

const AWARD_COLORS = { Bronze: '#A9702A', Silver: '#8E96A0', Gold: '#C99A2E' };

function renderMemberDetail(memberId) {
  const m = memberById(memberId);
  setTopbar('', () => go('members'));
  if (!m) { $main().innerHTML = `<p class="muted">Member not found.</p>`; return; }

  $main().innerHTML = `
    <h1 class="member-name-hero">${escapeHtml(m.name)}</h1>
    <button class="btn no-print" id="printRecord" style="margin-bottom:12px;">⬇ Download / print record</button>

    <div class="card no-print">
      <div class="card-title">Add or edit a badge for ${escapeHtml(m.name)}</div>
      <div id="addSelector"></div>
      <div id="addStatusRow" style="display:none; margin-top:10px;"></div>
    </div>

    <div class="card">
      <div class="card-title">Top awards</div>
      <div class="btn-row">
        ${TOP_AWARDS.map(a => {
          const id = `award_${slug(a)}`;
          const st = statusOf(m.id, id);
          const filled = st === 'has' || st === 'owed';
          const color = AWARD_COLORS[a];
          const style = filled
            ? `background:${color}; border-color:${color}; color:#fff;`
            : `background:#fff; border-color:${color}; color:${color};`;
          const dateLabel = statusDateLabel(m.id, id);
          return `<button class="btn award-btn" style="${style}" data-award="${id}">${a}<br><span style="font-size:11px; font-weight:500;">${STATUS_META[st].label}${dateLabel ? ' ' + dateLabel : ''}</span></button>`;
        }).join('')}
      </div>
      <p class="muted" style="margin-top:8px;">Theme awards earned so far: ${themeAwardCount(m.id)} / 6</p>
      <p class="muted" style="font-size:11.5px;">Tap an award to confirm you've physically given it — everything else here is automatic.</p>
    </div>

    <div id="themePanels"></div>
  `;

  document.getElementById('printRecord').onclick = () => {
    const oldTitle = document.title;
    document.title = `${m.name} - Badge Record`;
    window.print();
    document.title = oldTitle;
  };

  let pendingBadgeId = null;
  renderBadgeSelector(document.getElementById('addSelector'), (badgeId) => {
    pendingBadgeId = badgeId;
    const badge = badgeById(badgeId);
    const row = document.getElementById('addStatusRow');
    row.style.display = 'block';
    if (rawStatusOf(m.id, badgeId) === 'has') {
      alert('This member already gained that badge.');
    }
    if (badge.type === 'theme' || badge.type === 'award') {
      row.innerHTML = `<p class="muted" style="font-size:12.5px;">${escapeHtml(badge.name)} is tracked automatically — use its badge/award button above instead.</p>`;
    } else {
      row.innerHTML = `<div class="btn-row">${STATUSES.map(s => `<button class="btn" data-set="${s}">${STATUS_META[s].label}</button>`).join('')}</div>`;
      row.querySelectorAll('[data-set]').forEach(btn => btn.onclick = async () => {
        await DB.setStatus(m.id, pendingBadgeId, btn.dataset.set, {});
        await refreshState();
        renderMemberDetail(memberId);
      });
    }
  }, { hideAward: true });

  document.querySelectorAll('[data-award]').forEach(btn => btn.onclick = async () => {
    await toggleManualGained(m.id, btn.dataset.award);
    renderMemberDetail(memberId);
  });

  const panels = THEMES.map(t => {
    const themeStatus = statusOf(m.id, `theme_${t.id}`);
    const shieldFilled = themeStatus !== 'not_gained';
    const skillRows = t.skills.map(track => {
      const levels = SKILL_LEVELS.map(l => ({ level: l, badge: STATE.masterBadges.find(b => b.type === 'skill' && b.theme === t.id && b.track === track && b.level === l) }))
        .filter(x => statusOf(m.id, x.badge.id) !== 'not_gained');
      if (levels.length === 0) {
        return `<div class="badge-row"><span class="slot-empty">${track} — none yet</span></div>`;
      }
      return levels.map(x => `<div class="badge-row"><span>${escapeHtml(x.badge.name)}</span>${pillHtml(statusOf(m.id, x.badge.id), statusDateLabel(m.id, x.badge.id))}</div>`).join('');
    }).join('');

    const qualifyingInterestExists = STATE.masterBadges.some(b => b.type === 'interest' && b.theme === t.id &&
      (statusOf(m.id, b.id) === 'has' || statusOf(m.id, b.id) === 'owed'));
    const interestRowsList = STATE.masterBadges
      .filter(b => b.type === 'interest' && b.theme === t.id && statusOf(m.id, b.id) !== 'not_gained')
      .map(b => `<div class="badge-row"><span>${escapeHtml(b.name)}</span>${pillHtml(statusOf(m.id, b.id), statusDateLabel(m.id, b.id))}</div>`)
      .join('');
    const interestRows = interestRowsList + (!qualifyingInterestExists
      ? `<p class="muted" style="margin:4px 0 0 0;">You need an interest badge in this theme to gain your award 😊</p>`
      : '');

    return `
      <div class="theme-panel" style="background:${t.tint}; border-color:${t.color}55;">
        <div class="theme-panel-head" style="color:${t.color}; cursor:pointer;" data-theme-toggle="theme_${t.id}">
          <div class="shield" style="${shieldFilled ? `background:${t.color};` : ''}"></div>
          <h3 style="color:${t.color}">${t.name}</h3>
          <span style="margin-left:auto">${pillHtml(themeStatus, statusDateLabel(m.id, `theme_${t.id}`))}</span>
        </div>
        <div><strong style="font-size:12.5px;">Skills</strong>${skillRows}</div>
        <div style="margin-top:8px;"><strong style="font-size:12.5px;">Interest</strong>${interestRows}</div>
      </div>
    `;
  }).join('');

  document.getElementById('themePanels').innerHTML = panels;
  document.querySelectorAll('[data-theme-toggle]').forEach(el => el.onclick = async () => {
    await toggleManualGained(m.id, el.dataset.themeToggle);
    renderMemberDetail(memberId);
  });
}

// ============================================================
// INVENTORY
// ============================================================

function renderInventoryRoute(parts) {
  if (parts[0] === 'add') return renderInventoryAdd();
  return renderInventoryHome();
}

function computeOwedAndOnOrder() {
  const owed = STATE.masterBadges
    .map(b => ({ b, n: countByStatus(b.id, 'owed') }))
    .filter(x => x.n > 0)
    .sort((a, b2) => b2.n - a.n);
  const unconfirmed = STATE.masterBadges
    .map(b => ({ b, n: countByStatus(b.id, 'unconfirmed') }))
    .filter(x => x.n > 0)
    .sort((a, b2) => b2.n - a.n);
  const onOrder = STATE.masterBadges
    .map(b => ({ b, n: inventoryOf(b.id).onOrder }))
    .filter(x => x.n > 0)
    .sort((a, b2) => b2.n - a.n);
  return { owed, unconfirmed, onOrder };
}

function actionListHtml(title, list, suffix) {
  if (list.length === 0) return '';
  return `
    <div class="card">
      <div class="card-title">${title}</div>
      ${list.map(x => `<div class="summary-item" style="cursor:pointer;" data-jump="${x.b.id}"><span>${escapeHtml(x.b.name)}</span><span>${x.n} ${suffix}</span></div>`).join('')}
    </div>`;
}

function overallLastUpdated(source) {
  const dates = Object.values(source).map(x => x.updatedAt || x.lastUpdated || '').filter(Boolean);
  return dates.sort().slice(-1)[0] || '';
}

function formatLastUpdated(iso) {
  if (!iso) return 'Not recorded yet';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not recorded yet';
  return 'Updated ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const BADGE_TYPE_LABEL = {
  interest: 'Interest',
  skill: 'Skills Builder',
  theme: 'Theme Award',
  award: 'Top Award',
  extra: 'Extra',
};

let invOpenPanels = {}; // persists across re-renders in this session

function renderInventoryHome() {
  setTopbar('Inventory', null);
  const { owed, onOrder } = computeOwedAndOnOrder();

  const panels = THEMES.map(theme => {
    const themeBadge = STATE.masterBadges.find(b => b.type === 'theme' && b.theme === theme.id);
    const skillBadges = STATE.masterBadges.filter(b => b.type === 'skill' && b.theme === theme.id);
    const interestBadges = STATE.masterBadges.filter(b => b.type === 'interest' && b.theme === theme.id);
    const ordered = [themeBadge, ...skillBadges, ...interestBadges];
    return { key: theme.id, title: theme.name, color: theme.color, badges: ordered };
  });
  const extraPanels = EXTRA_CATEGORIES.map(cat => {
    let badges = STATE.masterBadges.filter(b => b.type === 'extra' && b.subcategory === cat.id);
    if (cat.id === 'awards-promise') {
      badges = [...STATE.masterBadges.filter(b => b.type === 'award'), ...badges];
    }
    return { key: 'extra_' + cat.id, title: cat.name, color: cat.color, badges };
  });
  panels.push(...extraPanels);

  function badgeLineHtml(b) {
    const inv = inventoryOf(b.id);
    const owedN = countByStatus(b.id, 'owed');
    const everTracked = !!STATE.inventory[b.id];
    if (!everTracked && inv.stock === 0 && inv.onOrder === 0 && owedN === 0) return '';
    return `
      <div class="inv-row">
        <div class="inv-row-top">
          <span><strong>${BADGE_TYPE_LABEL[b.type]}</strong>: ${escapeHtml(b.name)}</span>
          <span class="muted" style="font-size:11.5px;">${formatLastUpdated(inv.lastUpdated)}</span>
        </div>
        <div class="muted" style="margin:2px 0 6px;">Stock: ${inv.stock} · Owed: ${owedN} · On order: ${inv.onOrder}</div>
        <div class="btn-row">
          <button class="btn" data-order="${b.id}">Ordered</button>
          <button class="btn" data-adjust="${b.id}">Adjust stock</button>
        </div>
      </div>`;
  }

  const panelsHtml = panels.map(p => {
    const lines = p.badges.filter(Boolean).map(badgeLineHtml).filter(Boolean);
    if (lines.length === 0) return '';
    const isOpen = !!invOpenPanels[p.key];
    return `
      <details class="theme-inv-panel" data-panel-key="${p.key}" ${isOpen ? 'open' : ''}>
        <summary class="theme-inv-header" style="background:${p.color}">${p.title}</summary>
        <div class="theme-inv-body">${lines.join('')}</div>
      </details>`;
  }).join('');

  $main().innerHTML = `
    <div class="card">
      <p class="muted">Guides in the unit right now: <strong>${STATE.members.length}</strong></p>
    </div>

    <div class="card-title" style="margin: 4px 0 8px 2px;">Quick view</div>
    <div class="nav-grid" style="margin-bottom:14px;">
      <div class="card" style="margin-bottom:0;">
        <div class="card-title">Owed</div>
        ${owed.length === 0 ? `<p class="muted" style="font-size:12.5px;">None</p>` :
          owed.map(x => `<div class="summary-item" style="font-size:12.5px;"><span>${escapeHtml(x.b.name)}</span><span>${x.n}</span></div>`).join('')}
      </div>
      <div class="card" style="margin-bottom:0;">
        <div class="card-title">On order</div>
        ${onOrder.length === 0 ? `<p class="muted" style="font-size:12.5px;">None</p>` :
          onOrder.map(x => `<div class="summary-item" style="font-size:12.5px;"><span>${escapeHtml(x.b.name)}</span><span>${x.n}</span></div>`).join('')}
      </div>
    </div>

    <button class="link-row" data-go="inventory/add">+ Add a badge to track</button>

    ${panelsHtml || `<p class="muted">Nothing tracked yet — add a badge above, or log some statuses first.</p>`}
  `;
  $main().querySelector('[data-go]').onclick = () => go('inventory/add');
  document.querySelectorAll('[data-adjust]').forEach(btn => btn.onclick = () => adjustStockPrompt(btn.dataset.adjust));
  document.querySelectorAll('[data-order]').forEach(btn => btn.onclick = () => orderPrompt(btn.dataset.order));
  document.querySelectorAll('[data-panel-key]').forEach(el => {
    el.ontoggle = () => { invOpenPanels[el.dataset.panelKey] = el.open; };
  });
}

async function adjustStockPrompt(badgeId) {
  const badge = badgeById(badgeId);
  const before = inventoryOf(badgeId);
  const add = prompt(`${badge.name}\nCurrent stock: ${before.stock}\nHow many to ADD to stock (delivery arrived)? Use a negative number to remove.`, '0');
  if (add === null) return;
  const addN = parseInt(add, 10);
  if (!isNaN(addN) && addN !== 0) {
    await DB.adjustInventory(badgeId, { addStock: addN });
    await refreshState();
    renderInventoryHome();
  }
}

async function orderPrompt(badgeId) {
  const badge = badgeById(badgeId);
  const before = inventoryOf(badgeId);
  const qty = prompt(`${badge.name}\nCurrently on order: ${before.onOrder}\nHow many are you ordering? (use a negative number to correct a mistake)`, '');
  if (qty === null) return;
  const qtyN = parseInt(qty, 10);
  if (!isNaN(qtyN) && qtyN !== 0) {
    await DB.adjustInventory(badgeId, { addOnOrder: qtyN });
    await refreshState();
    renderInventoryHome();
  }
}

function renderInventoryAdd() {
  setTopbar('Add a badge to track', () => go('inventory'));
  $main().innerHTML = `<div class="card"><div id="invSelector"></div></div>`;
  renderBadgeSelector(document.getElementById('invSelector'), async (badgeId) => {
    const inv = inventoryOf(badgeId);
    if (inv.stock || inv.onOrder) { go(`inventory`); return; } // already tracked
    const stock = parseInt(prompt('Starting stock (leave blank for 0):') || '0', 10) || 0;
    const onOrder = parseInt(prompt('Starting "on order" quantity (leave blank for 0):') || '0', 10) || 0;
    await DB.adjustInventory(badgeId, { addStock: stock, setOnOrder: onOrder });
    await refreshState();
    go('inventory');
  });
}

boot();
