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

const TAB = 'Tickets';
const TOTAL = 100;
const MAX_BAD_PINS = 10;          // wrong PINs allowed per 10 minutes, for everyone together

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);           // one sale at a time, so a ticket can't be sold twice
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

    const sh = SpreadsheetApp.getActive().getSheetByName(TAB);
    if (!sh) return out({ ok: false, error: 'no_tab' });
    const values = sh.getDataRange().getValues();
    const head = values[0].map(h => String(h).toLowerCase().replace(/[^a-z]/g, ''));
    const iT = head.indexOf('ticketno');
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
      name: sn > 0 ? '' : name,
      block: sn > 0 ? '' : block,
      country: sn > 0 ? '' : country,
      type: d.type === 'Free' ? 'Free' : 'Paid',
      date: date
    };
    sh.appendRow(head.map(h => (h in fields ? fields[h] : '')));
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
