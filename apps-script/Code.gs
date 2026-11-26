/**
 * PYSS Bumper Draw – records ticket sales from the app into the "Tickets" tab.
 *
 * Setup (once): see README.md, "Selling tickets from the app".
 *  1. In the PYSS Google Sheet: Extensions → Apps Script. Replace the code with this file.
 *  2. Project Settings (gear) → Script Properties → add:
 *       OWNER_PIN   your own PIN (owner: can do everything, cancel any sale)
 *       OWNER_NAME  optional, your name as shown in the "By" column (default "Owner")
 *       ADMIN_PINS  one entry per admin, "Name:PIN" separated by commas,
 *                   e.g.  Ravi:483920, Suresh:771204
 *                   (admins sell, record payments, send reminders, cancel only their own sales)
 *     An older single PIN property still works as the owner PIN until OWNER_PIN is set.
 *  3. Deploy → New deployment → type "Web app".
 *       Execute as: Me      Who has access: Anyone
 *     Authorise it, then copy the Web app URL into APPS_SCRIPT_URL in index.html.
 *
 * The PIN never appears in the app's code: the app sends what the treasurer types,
 * and this script checks it here.
 */

// The PYSS sheet. Used when this script was created on its own at script.google.com
// instead of from the sheet's Extensions → Apps Script menu.
const SHEET_ID = '1aI3iV_viYfMjQY9MLlQ1r8LHHOdeM8Vksp_nr6bQG-k';
const TAB = 'Tickets';
const TOTAL = 100;
const MAX_BAD_PINS = 10;          // wrong PINs allowed per 10 minutes, for everyone together

// Headings accepted for each column (lower case, letters only) – the same ones the app reads.
const HEADINGS = {
  ticketno: ['ticketno', 'ticket', 'ticketnumber', 'no', 'tno'],
  sn: ['sn', 'sno', 'serial', 'serialno', 'membersn'],
  name: ['name', 'buyer', 'buyername', 'holder'],
  block: ['block'],
  country: ['country'],
  type: ['type', 'freepaid', 'paidfree', 'free', 'payment'],
  date: ['date', 'saledate', 'datesold', 'solddate'],
  by: ['by', 'soldby', 'addedby', 'recordedby', 'enteredby']
};

// Payments tab (dues app): Date | S/N | Name | Amount | Note | By
const PAY_TAB = 'Payments';
const PAY_HEADINGS = {
  date: ['date', 'datepaid', 'paidon'],
  sn: ['sn', 'sno', 'serial', 'serialno'],
  name: ['name', 'membername'],
  amount: ['amount', 'amountpaid', 'paid'],
  note: ['note', 'notes', 'remarks', 'remark'],
  by: ['by', 'recordedby', 'enteredby', 'addedby']
};

// Who a PIN belongs to: {role: 'owner' | 'admin', name} or null.
function whoIs(pin) {
  const p = PropertiesService.getScriptProperties();
  pin = String(pin || '').trim();
  if (!pin) return null;
  const ownerPin = String(p.getProperty('OWNER_PIN') || p.getProperty('PIN') || '').trim();
  if (ownerPin && pin === ownerPin) return { role: 'owner', name: clean(p.getProperty('OWNER_NAME')) || 'Owner' };
  const admins = String(p.getProperty('ADMIN_PINS') || '').split(/[,;\n]/);
  for (let i = 0; i < admins.length; i++) {
    const a = admins[i], k = a.lastIndexOf(':');
    if (k < 1) continue;
    const name = clean(a.slice(0, k)), apin = a.slice(k + 1).trim();
    if (apin && pin === apin) return { role: 'admin', name: name || 'Admin' };
  }
  return null;
}

function anyPinSet() {
  const p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('OWNER_PIN') || p.getProperty('PIN') || String(p.getProperty('ADMIN_PINS') || '').indexOf(':') > 0);
}

// Column -> field map for a heading row, using the given heading table.
function fieldsFor(head, table) {
  const used = {};
  return head.map(h => {
    for (const f in table) {
      if (!used[f] && table[f].indexOf(h) >= 0) { used[f] = true; return f; }
    }
    return '';
  });
}

// Make sure the tab has a "By" column; returns the updated column map.
function ensureBy(sh, head, cols) {
  if (cols.indexOf('by') >= 0) return cols;
  sh.getRange(1, head.length + 1).setValue('By');
  return cols.concat(['by']);
}

// Which field each column holds ('' for columns the app doesn't use); first match per field wins.
function columnFields(head) {
  return fieldsFor(head, HEADINGS);
}

// ---- WhatsApp reminders: members' numbers live in a separate PRIVATE sheet ----
// Script Properties → CONTACTS_SHEET_ID = the ID of that sheet (keep its sharing Restricted).
// Its first tab needs an S/N column and a WhatsApp number column (with country code).
const CONTACT_HEADINGS = {
  sn: ['sn', 'sno', 'serial', 'serialno', 'membersn'],
  phone: ['whatsapp', 'whatsappnumber', 'whatsappno', 'phone', 'phonenumber', 'phoneno', 'mobile', 'mobileno', 'mobilenumber', 'number'],
  reminded: ['reminded', 'remindedon', 'lastreminded']
};

function contactsSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('CONTACTS_SHEET_ID');
  if (!id) return null;
  return SpreadsheetApp.openById(id.trim()).getSheets()[0];
}

function contactCols(sh) {
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(h => String(h).toLowerCase().replace(/[^a-z]/g, ''));
  const c = {};
  for (const f in CONTACT_HEADINGS) c[f] = head.findIndex(h => CONTACT_HEADINGS[f].indexOf(h) >= 0);
  c.width = head.length;
  return c;
}

function ymd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').trim();
}

// S/N -> { phone (digits only, with country code), reminded (date or '') }
function readContacts() {
  const sh = contactsSheet();
  if (!sh) return { error: 'no_contacts' };
  const c = contactCols(sh);
  if (c.sn < 0 || c.phone < 0) return { error: 'contacts_columns' };
  const rows = sh.getDataRange().getValues();
  const list = {};
  for (let r = 1; r < rows.length; r++) {
    const sn = Math.round(Number(rows[r][c.sn]));
    let phone = String(rows[r][c.phone] || '').replace(/[^0-9]/g, '').replace(/^00/, '');
    if (!(sn > 0) || !phone) continue;
    list[sn] = { phone: phone, reminded: c.reminded >= 0 ? ymd(rows[r][c.reminded]) : '' };
  }
  return { list: list };
}

// Records today's date in the Reminded column for one member (adds the column if missing).
function markReminded(sn, date) {
  const sh = contactsSheet();
  if (!sh) return { error: 'no_contacts' };
  const c = contactCols(sh);
  if (c.sn < 0) return { error: 'contacts_columns' };
  let col = c.reminded;
  if (col < 0) { col = c.width; sh.getRange(1, col + 1).setValue('Reminded'); }
  const rows = sh.getDataRange().getValues();
  for (let r = 1; r < rows.length; r++) {
    if (Math.round(Number(rows[r][c.sn])) === sn) { sh.getRange(r + 1, col + 1).setValue(date); return { ok: true }; }
  }
  return { error: 'not_found' };
}

function book() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
}

// Opening the web app link in a browser shows this check, so setup problems are easy to spot.
// It reveals nothing private: only whether each part is in place.
function doGet() {
  const p = PropertiesService.getScriptProperties();
  const r = {
    app: 'PYSS Bumper Draw',
    pinSet: anyPinSet(),
    ownerPin: !!(p.getProperty('OWNER_PIN') || p.getProperty('PIN')),
    admins: String(p.getProperty('ADMIN_PINS') || '').split(/[,;\n]/).filter(a => a.indexOf(':') > 0).length
  };
  try {
    const ss = book();
    r.sheet = ss.getName();
    const sh = ss.getSheetByName(TAB);
    r.ticketsTab = !!sh;
    if (sh) {
      const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
        .map(h => String(h).toLowerCase().replace(/[^a-z]/g, ''));
      r.ticketNoColumn = columnFields(head).indexOf('ticketno') >= 0;
    }
  } catch (err) {
    r.sheetError = String(err && err.message || err);
  }
  try {
    const ct = readContacts();
    r.contacts = ct.error ? ct.error : Object.keys(ct.list).length + ' numbers';
  } catch (err) {
    r.contacts = 'error: ' + String(err && err.message || err);
  }
  r.ready = !!(r.pinSet && r.ticketsTab && r.ticketNoColumn);
  return out(r);
}

function doPost(e) {
  try {
    return handle(e);
  } catch (err) {
    return out({ ok: false, error: 'script_error', message: String(err && err.message || err).slice(0, 200) });
  }
}

function handle(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return out({ ok: false, error: 'busy' });   // one sale at a time, so a ticket can't be sold twice
  try {
    let d;
    try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (err) { return out({ ok: false, error: 'bad_request' }); }

    if (!anyPinSet()) return out({ ok: false, error: 'no_pin_set' });

    const cache = CacheService.getScriptCache();
    const bad = Number(cache.get('badPins') || 0);
    if (bad >= MAX_BAD_PINS) return out({ ok: false, error: 'locked' });
    const who = whoIs(d.pin);
    if (!who) {
      cache.put('badPins', String(bad + 1), 600);
      return out({ ok: false, error: 'bad_pin' });
    }

    if (d.action === 'check') return out({ ok: true, role: who.role, name: who.name });

    if (d.action === 'pay') return out(recordPayment(d, who));

    if (d.action === 'contacts') {
      const ct = readContacts();
      return out(ct.error ? { ok: false, error: ct.error } : { ok: true, contacts: ct.list });
    }
    if (d.action === 'mark') {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? String(d.date) : ymd(new Date());
      const m = markReminded(Math.round(Number(d.sn)), date);
      return out(m.error ? { ok: false, error: m.error } : { ok: true });
    }

    const sh = book().getSheetByName(TAB);
    if (!sh) return out({ ok: false, error: 'no_tab' });
    const values = sh.getDataRange().getValues();
    const head = values[0].map(h => String(h).toLowerCase().replace(/[^a-z]/g, ''));
    const cols = columnFields(head);
    const iT = cols.indexOf('ticketno');
    if (iT < 0) return out({ ok: false, error: 'no_column' });

    const no = Math.round(Number(d.ticket));
    if (!(no >= 1 && no <= TOTAL)) return out({ ok: false, error: 'bad_ticket' });

    if (d.action === 'cancel') {
      const iBy = cols.indexOf('by');
      for (let r = values.length - 1; r >= 1; r--) {
        if (Math.round(Number(values[r][iT])) !== no) continue;
        // Admins may only cancel sales they made themselves; the owner may cancel any.
        if (who.role !== 'owner' && (iBy < 0 || String(values[r][iBy]).trim() !== who.name)) {
          return out({ ok: false, error: 'not_yours' });
        }
        sh.deleteRow(r + 1);
        return out({ ok: true, ticket: no });
      }
      return out({ ok: false, error: 'not_sold' });
    }

    for (let r = 1; r < values.length; r++) {
      if (Math.round(Number(values[r][iT])) === no) return out({ ok: false, error: 'taken' });
    }

    const sn = Math.round(Number(d.sn));
    const name = clean(d.name), block = clean(d.block), country = clean(d.country);
    if (!(sn > 0) && !name) return out({ ok: false, error: 'no_name' });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? String(d.date) : '';

    const fields = {
      ticketno: no,
      sn: sn > 0 ? sn : '',
      // A member is stored by S/N; their name is written only if the tab has no S/N column.
      name: sn > 0 ? (cols.indexOf('sn') >= 0 ? '' : clean(d.memberName)) : name,
      block: sn > 0 ? '' : block,
      country: sn > 0 ? '' : country,
      type: d.type === 'Free' ? 'Free' : 'Paid',
      date: date,
      by: who.name
    };
    const cols2 = ensureBy(sh, head, cols);
    sh.appendRow(cols2.map(f => (f ? fields[f] : '')));
    return out({ ok: true, ticket: no, by: who.name });
  } finally {
    lock.releaseLock();
  }
}

// Dues app: add one payment row to the Payments tab.
function recordPayment(d, who) {
  const sh = book().getSheetByName(PAY_TAB);
  if (!sh) return { ok: false, error: 'no_pay_tab' };
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(h => String(h).toLowerCase().replace(/[^a-z]/g, ''));
  let cols = fieldsFor(head, PAY_HEADINGS);
  if (cols.indexOf('sn') < 0 || cols.indexOf('amount') < 0) return { ok: false, error: 'pay_columns' };
  const sn = Math.round(Number(d.sn)), amount = Math.round(Number(d.amount));
  if (!(sn > 0)) return { ok: false, error: 'bad_member' };
  if (!(amount > 0 && amount <= 1000000)) return { ok: false, error: 'bad_amount' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? String(d.date) : ymd(new Date());
  cols = ensureBy(sh, head, cols);
  const fields = { date: date, sn: sn, name: clean(d.name), amount: amount, note: clean(d.note), by: who.name };
  sh.appendRow(cols.map(f => (f ? fields[f] : '')));
  return { ok: true, by: who.name };
}

// Plain text only, short, and never starting like a formula.
function clean(s) {
  s = String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
