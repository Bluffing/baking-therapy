/**
 * Baking Therapy order backend - Google Apps Script bound to a Google Sheet.
 *
 * Sheet tabs (created automatically by setup()):
 *   Products: id | name | description | price | available
 *   Orders:   received_at | order_id | name | email | phone | pickup_date | items | total | notes | status
 *
 * Endpoints (after Deploy > New deployment > Web app):
 *   GET  -> { products: [...] }      menu for the website
 *   POST -> { ok: true, orderId }    places an order (body is JSON sent as text/plain)
 */

// Customers can't pick a pickup date sooner than this many days from today.
const MIN_LEAD_DAYS = 1;
const MAX_QTY_PER_ITEM = 50;

const PRODUCTS_SHEET = 'Products';
const ORDERS_SHEET = 'Orders';

/** Run once from the Apps Script editor to create the tabs with headers and sample products. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let products = ss.getSheetByName(PRODUCTS_SHEET);
  if (!products) {
    products = ss.insertSheet(PRODUCTS_SHEET);
    products.appendRow(['id', 'name', 'description', 'price', 'available']);
    products.appendRow(['croissant', 'Butter croissant', 'Flaky, all-butter', 3.5, true]);
    products.appendRow(['sourdough', 'Sourdough loaf', '800 g country loaf', 9, true]);
    products.appendRow(['cookie-box', 'Cookie box (6)', 'Chocolate chip', 12, true]);
    products.setFrozenRows(1);
  }

  let orders = ss.getSheetByName(ORDERS_SHEET);
  if (!orders) {
    orders = ss.insertSheet(ORDERS_SHEET);
    orders.appendRow(['received_at', 'order_id', 'name', 'email', 'phone', 'pickup_date', 'items', 'total', 'notes', 'status']);
    orders.setFrozenRows(1);
  }
}

function doGet() {
  return json_({ products: readProducts_().filter(p => p.available) });
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
        safe_(order.email),
        safe_(order.phone),
        order.pickupDate,
        safe_(order.itemsText),
        order.total,
        safe_(order.notes),
        'new',
      ]);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true, orderId: order.orderId });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function readProducts_() {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRODUCTS_SHEET).getDataRange().getValues();
  rows.shift(); // headers
  return rows
    .filter(r => r[0])
    .map(r => ({
      id: String(r[0]).trim(),
      name: String(r[1]),
      description: String(r[2] || ''),
      price: Number(r[3]) || 0,
      available: r[4] === true || String(r[4]).toLowerCase() === 'true',
    }));
}

function validate_(body) {
  const name = str_(body.name, 100);
  const email = str_(body.email, 200);
  const phone = str_(body.phone, 30);
  const notes = str_(body.notes, 1000);
  const pickupDate = str_(body.pickupDate, 10);

  if (!name) throw new Error('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) throw new Error('Pickup date is required.');

  const tz = Session.getScriptTimeZone();
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + MIN_LEAD_DAYS);
  if (pickupDate < Utilities.formatDate(earliest, tz, 'yyyy-MM-dd')) {
    throw new Error('Pickup date must be at least ' + MIN_LEAD_DAYS + ' day(s) from today.');
  }

  // Prices always come from the sheet, never from the browser.
  const catalog = {};
  readProducts_().filter(p => p.available).forEach(p => (catalog[p.id] = p));

  const lines = [];
  let total = 0;
  (Array.isArray(body.items) ? body.items : []).forEach(item => {
    const product = catalog[String(item.id)];
    const qty = Math.floor(Number(item.qty));
    if (!product || !(qty > 0)) return;
    if (qty > MAX_QTY_PER_ITEM) throw new Error('Max ' + MAX_QTY_PER_ITEM + ' per item.');
    lines.push(qty + ' x ' + product.name);
    total += qty * product.price;
  });
  if (!lines.length) throw new Error('Your order is empty.');

  return {
    orderId: Utilities.formatDate(new Date(), tz, 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    name, email, phone, notes, pickupDate,
    itemsText: lines.join('\n'),
    total: Math.round(total * 100) / 100,
  };
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
