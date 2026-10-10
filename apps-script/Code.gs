/**
 * Baking Therapy order backend - Google Apps Script bound to a Google Sheet.
 *
 * Sheet tabs (created or renamed by setup()):
 *   Produits:  id | nom | mode | formats | saveurs | max_total | disponible
 *   Commandes: recu_le | no_commande | nom | cueillette | articles | total | statut
 *
 * Products tab:
 *   mode "format":   customer picks one format (e.g. "3 biscuits=5; 6 biscuits=10") and one saveur.
 *                    A single format shows as a checkbox.
 *   mode "quantite": customer picks a quantity per saveur, priced with the first format,
 *                    max_total loaves/items combined.
 *
 * Endpoints (after Deploy > New deployment > Web app):
 *   GET  -> { products: [...], pickupDates: ['yyyy-MM-dd', ...] }
 *   POST -> { ok: true, orderId }    places an order (body is JSON sent as text/plain)
 */

// Earliest pickup is this many days from today.
const MIN_LEAD_DAYS = 1;
// Pickup days, 0 = Sunday ... 6 = Saturday. Only the next occurrence of each is offered.
const PICKUP_WEEKDAYS = [5, 1]; // Friday, Monday
// Orders placed on a Sunday get Thursday instead of Monday.
const SUNDAY_PICKUP_WEEKDAYS = [5, 4]; // Friday, Thursday
// Safety cap for "quantite" products without max_total.
const DEFAULT_MAX_QTY = 10;

const PRODUCTS_SHEET = 'Produits';
const ORDERS_SHEET = 'Commandes';
const PRODUCT_HEADERS = ['id', 'nom', 'mode', 'formats', 'saveurs', 'max_total', 'disponible'];
const ORDER_HEADERS = ['recu_le', 'no_commande', 'nom', 'cueillette', 'articles', 'total', 'statut'];

/** Run from the Apps Script editor: creates (or renames the old English) tabs and writes the headers. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [
    [getOrCreateSheet_(ss, PRODUCTS_SHEET, 'Products'), PRODUCT_HEADERS],
    [getOrCreateSheet_(ss, ORDERS_SHEET, 'Orders'), ORDER_HEADERS],
  ].forEach(([sheet, headers]) => {
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).clearContent();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });
}

function getOrCreateSheet_(ss, name, legacyName) {
  const sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  const legacy = ss.getSheetByName(legacyName);
  return legacy ? legacy.setName(name) : ss.insertSheet(name);
}

function doGet() {
  return json_({ products: readProducts_(), pickupDates: pickupDates_() });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Honeypot: real users never fill this hidden field, bots usually do.
    if (body.website) return json_({ ok: true, orderId: 'ignored' });

    const order = validate_(body);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET).appendRow([
        new Date(),
        order.orderId,
        safe_(order.name),
        order.pickupDate,
        safe_(order.itemsText),
        order.total,
        'nouvelle',
      ]);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true, orderId: order.orderId });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/** Next date (>= MIN_LEAD_DAYS away) for each pickup weekday, sorted. */
function pickupDates_() {
  const tz = Session.getScriptTimeZone();
  // 'u' is 1 (Monday) to 7 (Sunday); % 7 makes Sunday 0.
  const weekdayOf = date => Number(Utilities.formatDate(date, tz, 'u')) % 7;
  const weekdays = weekdayOf(new Date()) === 0 ? SUNDAY_PICKUP_WEEKDAYS : PICKUP_WEEKDAYS;
  const dates = [];
  weekdays.forEach(weekday => {
    for (let d = MIN_LEAD_DAYS; d < MIN_LEAD_DAYS + 7; d++) {
      const date = new Date(Date.now() + d * 86400000);
      if (weekdayOf(date) === weekday) {
        dates.push(Utilities.formatDate(date, tz, 'yyyy-MM-dd'));
        break;
      }
    }
  });
  return dates.sort();
}

function readProducts_() {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRODUCTS_SHEET).getDataRange().getValues();
  rows.shift(); // headers
  return rows
    .filter(r => String(r[0]).trim() && isYes_(r[6]))
    .map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1]).trim(),
      mode: /^quantit/i.test(String(r[2]).trim()) ? 'quantite' : 'format',
      formats: parseFormats_(r[3]),
      flavors: splitList_(r[4]),
      maxTotal: Math.floor(Number(r[5])) || DEFAULT_MAX_QTY,
    }))
    .filter(p => p.formats.length);
}

/** "3 biscuits=5; 6 biscuits=10" -> [{ label: '3 biscuits', price: 5 }, ...] */
function parseFormats_(text) {
  return splitList_(text)
    .map(s => {
      const i = s.lastIndexOf('=');
      if (i < 0) return null;
      const price = Number(s.slice(i + 1).replace(',', '.').replace('$', '').trim());
      return { label: s.slice(0, i).trim(), price };
    })
    .filter(f => f && f.label && f.price >= 0);
}

function splitList_(text) {
  return String(text == null ? '' : text).split(';').map(s => s.trim()).filter(Boolean);
}

function isYes_(v) {
  return ['true', 'vrai', 'oui', 'yes', '1'].indexOf(String(v).trim().toLowerCase()) >= 0;
}

function validate_(body) {
  const name = str_(body.name, 100);
  const pickupDate = str_(body.pickupDate, 10);

  if (!name) throw new Error('Votre nom est requis.');
  if (pickupDates_().indexOf(pickupDate) < 0) throw new Error('Choisissez une date de cueillette valide.');

  // Prices always come from the sheet, never from the browser.
  const catalog = {};
  readProducts_().forEach(p => (catalog[p.id] = p));

  const seen = {};
  const lines = [];
  let total = 0;
  (Array.isArray(body.items) ? body.items : []).forEach(item => {
    const product = catalog[String(item.id)];
    if (!product || seen[product.id]) return;
    seen[product.id] = true;

    if (product.mode === 'quantite') {
      const quantities = item.quantities || {};
      const parts = [];
      let count = 0;
      product.flavors.forEach(flavor => {
        const qty = Math.floor(Number(quantities[flavor]) || 0);
        if (qty > 0) {
          count += qty;
          parts.push(qty + ' ' + flavor);
        }
      });
      if (!count) return;
      if (count > product.maxTotal) throw new Error('Maximum ' + product.maxTotal + ' au total pour ' + product.name + '.');
      const price = count * product.formats[0].price;
      lines.push(product.name + ' : ' + parts.join(', ') + ' (' + money_(price) + ')');
      total += price;
      return;
    }

    const format = product.formats.find(f => f.label === item.format);
    if (!format) return;
    let flavor = '';
    if (product.flavors.length === 1) flavor = product.flavors[0];
    if (product.flavors.length > 1) {
      flavor = product.flavors.find(f => f === item.flavor);
      if (!flavor) throw new Error('Choisissez une saveur pour ' + product.name + '.');
    }
    lines.push(product.name + ' : ' + format.label + (flavor ? ' - ' + flavor : '') + ' (' + money_(format.price) + ')');
    total += format.price;
  });
  if (!lines.length) throw new Error('Votre commande est vide.');

  const tz = Session.getScriptTimeZone();
  return {
    orderId: Utilities.formatDate(new Date(), tz, 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    name, pickupDate,
    itemsText: lines.join('\n'),
    total: Math.round(total * 100) / 100,
  };
}

function money_(n) {
  return n.toFixed(2).replace('.', ',') + ' $';
}

function str_(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// Stops customer input from being interpreted as a spreadsheet formula.
function safe_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
