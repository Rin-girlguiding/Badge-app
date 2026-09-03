/**
 * Badge Tracker — Apps Script backend.
 *
 * Bind this script to your Google Sheet (Extensions > Apps Script),
 * paste this file in, then deploy as a Web App (see SETUP.md).
 *
 * Expects these tabs in the Sheet (create with these exact headers):
 *
 *   Members       | id | name |
 *   Statuses      | memberId | badgeId | status | note | month | year | updatedAt |
 *   Inventory     | badgeId | stock | onOrder | lastUpdated |
 *   ExtraBadges   | name | category | */

const SHEET_MEMBERS = 'Members';
const SHEET_STATUSES = 'Statuses';
const SHEET_INVENTORY = 'Inventory';
const SHEET_EXTRAS = 'ExtraBadges';

function doGet(e) {
  return respond(getAll());
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;
  let result;
  switch (action) {
    case 'getAll': result = getAll(); break;
    case 'saveMember': result = saveMember(body.member); break;
    case 'deleteMember': result = deleteMember(body.id); break;
    case 'setStatus': result = setStatus(body.memberId, body.badgeId, body.status, body.note, body.month, body.year); break;
    case 'adjustInventory': result = adjustInventory(body.badgeId, body.addStock, body.setOnOrder, body.addOnOrder); break;
    case 'addExtraBadge': result = addExtraBadge(body.name, body.initialStock, body.initialOnOrder, body.category); break;
    default: result = { error: 'Unknown action: ' + action };
  }
  return respond(result);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function readRows(sheetName) {
  const sh = sheet(sheetName);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(r => r.join('') !== '').map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

function getAll() {
  const members = readRows(SHEET_MEMBERS).map(r => ({ id: String(r.id), name: r.name }));
  const statuses = {};
  readRows(SHEET_STATUSES).forEach(r => {
    statuses[`${r.memberId}|${r.badgeId}`] = { status: r.status, note: r.note || '', month: r.month || '', year: r.year || '', updatedAt: r.updatedAt || '' };
  });
  const inventory = {};
  readRows(SHEET_INVENTORY).forEach(r => {
    inventory[r.badgeId] = { stock: Number(r.stock) || 0, onOrder: Number(r.onOrder) || 0, lastUpdated: r.lastUpdated || '' };
  });
  const extraBadgeNames = readRows(SHEET_EXTRAS).map(r => r.name);
  const extraBadgeCategories = {};
  readRows(SHEET_EXTRAS).forEach(r => { if (r.category) extraBadgeCategories[r.name] = r.category; });
  return { members, statuses, inventory, extraBadgeNames, extraBadgeCategories };
}

function saveMember(member) {
  const sh = sheet(SHEET_MEMBERS);
  if (member.id) {
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(member.id)) {
        sh.getRange(i + 1, 2).setValue(member.name);
        return member;
      }
    }
  }
  const id = 'm_' + new Date().getTime();
  sh.appendRow([id, member.name]);
  member.id = id;
  return member;
}

function deleteMember(id) {
  deleteRowsWhere(SHEET_MEMBERS, row => String(row[0]) === String(id));
  deleteRowsWhere(SHEET_STATUSES, row => String(row[0]) === String(id));
  return { ok: true };
}

function deleteRowsWhere(sheetName, predicate) {
  const sh = sheet(sheetName);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (predicate(data[i])) sh.deleteRow(i + 1);
  }
}

function findStatusRow(sh, data, memberId, badgeId) {
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(memberId) && String(data[i][1]) === String(badgeId)) return i + 1;
  }
  return -1;
}

function setStatus(memberId, badgeId, status, note, month, year) {
  const sh = sheet(SHEET_STATUSES);
  const data = sh.getDataRange().getValues();
  const rowIdx = findStatusRow(sh, data, memberId, badgeId);
  const wasHas = rowIdx > -1 && data[rowIdx - 1][2] === 'has';
  const willBeHas = status === 'has';
  const now = new Date().toISOString();

  if (status === 'not_gained') {
    if (rowIdx > -1) sh.deleteRow(rowIdx);
  } else if (rowIdx > -1) {
    sh.getRange(rowIdx, 3, 1, 5).setValues([[status, note || '', month || '', year || '', now]]);
  } else {
    sh.appendRow([memberId, badgeId, status, note || '', month || '', year || '', now]);
  }

  if (willBeHas && !wasHas) adjustInventory(badgeId, -1, null, null);
  if (wasHas && !willBeHas) adjustInventory(badgeId, 1, null, null);

  return { ok: true };
}

function adjustInventory(badgeId, addStock, setOnOrder, addOnOrder) {
  const sh = sheet(SHEET_INVENTORY);
  const data = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(badgeId)) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) {
    sh.appendRow([badgeId, 0, 0, '']);
    rowIdx = sh.getLastRow();
  }
  const row = sh.getRange(rowIdx, 1, 1, 4).getValues()[0];
  let stock = Number(row[1]) || 0;
  let onOrder = Number(row[2]) || 0;
  let touched = false;

  if (typeof addStock === 'number' && addStock) {
    stock = Math.max(0, stock + addStock);
    if (addStock > 0) onOrder = Math.max(0, onOrder - addStock);
    touched = true;
  }
  if (typeof addOnOrder === 'number' && addOnOrder) {
    onOrder = Math.max(0, onOrder + addOnOrder);
    touched = true;
  }
  if (typeof setOnOrder === 'number') { onOrder = Math.max(0, setOnOrder); touched = true; }

  const lastUpdated = touched ? new Date().toISOString() : row[3];
  sh.getRange(rowIdx, 2, 1, 3).setValues([[stock, onOrder, lastUpdated]]);
  return { stock, onOrder, lastUpdated };
}

function addExtraBadge(name, initialStock, initialOnOrder, category) {
  const sh = sheet(SHEET_EXTRAS);
  const rows = readRows(SHEET_EXTRAS);
  const existing = rows.find(r => r.name === name);
  if (!existing) {
    sh.appendRow([name, category || '']);
  } else if (category) {
    // update category on the existing row
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === name) { sh.getRange(i + 1, 2).setValue(category); break; }
    }
  }
  const id = 'extra_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  adjustInventory(id, initialStock || 0, initialOnOrder || 0, null);
  return { id };
}
