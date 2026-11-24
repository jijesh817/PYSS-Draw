/**
 * PYSS Bumper Draw – records ticket sales from the app into the "Tickets" tab.
 *
 * Setup (once): see README.md, "Selling tickets from the app".
 *  1. In the PYSS Google Sheet: Extensions → Apps Script. Replace the code with this file.
 *  2. Project Settings (gear) → Script Properties → Add property:
 *       Property: PIN    Value: a number only the treasurer knows (e.g. 6 digits)
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
  date: ['date', 'saledate', 'datesold', 'solddate']
};

// Which field each column holds ('' for columns the app doesn't use); first match per field wins.
function columnFields(head) {
  const used = {};
  return head.map(h => {
    for (const f in HEADINGS) {
      if (!used[f] && HEADINGS[f].indexOf(h) >= 0) { used[f] = true; return f; }
    }
    return '';
  });
}

function book() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
}

// Opening the web app link in a browser shows this check, so setup problems are easy to spot.
// It reveals nothing private: only whether each part is in place.
function doGet() {
  const r = { app: 'PYSS Bumper Draw', pinSet: !!PropertiesService.getScriptProperties().getProperty('PIN') };
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

    const pin = PropertiesService.getScriptProperties().getProperty('PIN');
    if (!pin) return out({ ok: false, error: 'no_pin_set' });

    const cache = CacheService.getScriptCache();
    const bad = Number(cache.get('badPins') || 0);
    if (bad >= MAX_BAD_PINS) return out({ ok: false, error: 'locked' });
    if (String(d.pin || '') !== String(pin)) {
      cache.put('badPins', String(bad + 1), 600);
      return out({ ok: false, error: 'bad_pin' });
    }

    if (d.action === 'check') return out({ ok: true });

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
      for (let r = values.length - 1; r >= 1; r--) {
        if (Math.round(Number(values[r][iT])) === no) { sh.deleteRow(r + 1); return out({ ok: true, ticket: no }); }
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
      date: date
    };
    sh.appendRow(cols.map(f => (f ? fields[f] : '')));
    return out({ ok: true, ticket: no });
  } finally {
    lock.releaseLock();
  }
}

// Plain text only, short, and never starting like a formula.
function clean(s) {
  s = String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
