// ============================================================
// Data layer. Two modes, same interface:
//   - CONFIG.API_URL set   -> talks to the Google Apps Script backend
//   - CONFIG.API_URL empty -> saves to this browser's local storage
// This means the app works standalone immediately, and switches to
// shared Google Sheets storage the moment you deploy the backend
// and paste the URL into config.js — no other code changes needed.
// ============================================================

const LOCAL_KEY = 'badge-tracker-data-v1';
const REMOTE = () => !!CONFIG.API_URL;

function emptyStore() {
  return {
    members: [],
    statuses: {},   // `${memberId}|${badgeId}` -> {status, note, month, year, updatedAt}
    inventory: {},  // badgeId -> {stock, onOrder, lastUpdated}
    extraBadgeNames: DEFAULT_EXTRA_BADGES.slice(),
    extraBadgeCategories: {}, // name -> 'birthday' | 'awards-promise' | 'non-program'
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    let store;
    if (!raw) {
      // First ever run in this browser: start from the seed data
      // (from your original spreadsheet) if it's been included.
      store = typeof SEED_DATA !== 'undefined' ? { ...emptyStore(), ...SEED_DATA } : emptyStore();
    } else {
      store = { ...emptyStore(), ...JSON.parse(raw) };
    }
    // Additive migration: pick up any newly-introduced default Extra
    // badges (e.g. a new starter badge added later) without touching
    // anything already there.
    let migrated = false;
    DEFAULT_EXTRA_BADGES.forEach(name => {
      if (!store.extraBadgeNames.includes(name)) {
        store.extraBadgeNames.push(name);
        migrated = true;
      }
    });
    if (!raw || migrated) saveLocal(store);
    return store;
  } catch (e) {
    return emptyStore();
  }
}

function saveLocal(store) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

async function remoteCall(action, payload) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error('Request failed: ' + action);
  return res.json();
}

// ---------- Public data API ----------

const DB = {
  async getAll() {
    if (REMOTE()) return remoteCall('getAll', {});
    return loadLocal();
  },

  async saveMember(member) {
    if (REMOTE()) return remoteCall('saveMember', { member });
    const store = loadLocal();
    if (member.id) {
      const m = store.members.find(x => x.id === member.id);
      if (m) m.name = member.name;
    } else {
      member.id = 'm_' + Date.now();
      store.members.push(member);
    }
    saveLocal(store);
    return member;
  },

  async deleteMember(id) {
    if (REMOTE()) return remoteCall('deleteMember', { id });
    const store = loadLocal();
    store.members = store.members.filter(m => m.id !== id);
    Object.keys(store.statuses).forEach(key => {
      if (key.startsWith(id + '|')) delete store.statuses[key];
    });
    saveLocal(store);
  },

  // Sets a status, applying the stock auto-adjust rule:
  // moving TO 'has' decrements stock by 1; moving AWAY FROM 'has'
  // (that wasn't already counted) increments it back by 1.
  async setStatus(memberId, badgeId, status, extra) {
    if (REMOTE()) return remoteCall('setStatus', { memberId, badgeId, status, ...extra });
    const store = loadLocal();
    const key = `${memberId}|${badgeId}`;
    const prev = store.statuses[key];
    const wasHas = prev && prev.status === 'has';
    const willBeHas = status === 'has';

    store.statuses[key] = { status, note: (extra && extra.note) || '', month: (extra && extra.month) || '', year: (extra && extra.year) || '', updatedAt: new Date().toISOString() };
    if (status === 'not_gained') delete store.statuses[key];

    if (!store.inventory[badgeId]) store.inventory[badgeId] = { stock: 0, onOrder: 0 };
    if (willBeHas && !wasHas) {
      store.inventory[badgeId].stock = Math.max(0, store.inventory[badgeId].stock - 1);
      store.inventory[badgeId].lastUpdated = new Date().toISOString();
    }
    if (wasHas && !willBeHas) {
      store.inventory[badgeId].stock += 1;
      store.inventory[badgeId].lastUpdated = new Date().toISOString();
    }

    saveLocal(store);
  },

  async bulkSetStatus(memberIds, badgeId, status) {
    for (const memberId of memberIds) {
      await DB.setStatus(memberId, badgeId, status, {});
    }
  },

  // changes: { addStock?, addOnOrder?, setOnOrder? }
  //   addStock    - delta added to stock (receiving a delivery); auto-reduces onOrder by the same amount
  //   addOnOrder  - delta added to onOrder (placing a new order)
  //   setOnOrder  - absolute overwrite of onOrder (used when first adding a badge to track)
  async adjustInventory(badgeId, changes) {
    if (REMOTE()) return remoteCall('adjustInventory', { badgeId, ...changes });
    const store = loadLocal();
    if (!store.inventory[badgeId]) store.inventory[badgeId] = { stock: 0, onOrder: 0 };
    const inv = store.inventory[badgeId];
    let touched = false;
    if (typeof changes.addStock === 'number' && changes.addStock !== 0) {
      inv.stock = Math.max(0, inv.stock + changes.addStock);
      if (changes.addStock > 0) inv.onOrder = Math.max(0, inv.onOrder - changes.addStock);
      touched = true;
    }
    if (typeof changes.addOnOrder === 'number' && changes.addOnOrder !== 0) {
      inv.onOrder = Math.max(0, inv.onOrder + changes.addOnOrder);
      touched = true;
    }
    if (typeof changes.setOnOrder === 'number') {
      inv.onOrder = Math.max(0, changes.setOnOrder);
      touched = true;
    }
    if (touched) inv.lastUpdated = new Date().toISOString();
    saveLocal(store);
  },

  async addExtraBadge(name, initialStock, initialOnOrder, category) {
    if (REMOTE()) return remoteCall('addExtraBadge', { name, initialStock, initialOnOrder, category });
    const store = loadLocal();
    if (!store.extraBadgeNames.includes(name)) store.extraBadgeNames.push(name);
    if (category) store.extraBadgeCategories[name] = category;
    const id = `extra_${slug(name)}`;
    store.inventory[id] = { stock: initialStock || 0, onOrder: initialOnOrder || 0 };
    saveLocal(store);
    return id;
  },

  // Downloads everything currently stored in this browser as a JSON file,
  // so it can be handed back for baking into a fresh seed-data.js later.
  exportData() {
    const store = loadLocal();
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `badge-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
