// Paste your Apps Script web app URL here (Deploy > New deployment > Web app). See README.md.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzL0GeWwaxpDciKc5WEKRmpZviYyaDmAluYOIfxZnn6gJGkYwHmhZ4Qts3uzQVcPDWcyA/exec';
// Keep in sync with MIN_LEAD_DAYS in apps-script/Code.gs.
const MIN_LEAD_DAYS = 1;

const form = document.getElementById('order-form');
const menuEl = document.getElementById('menu');
const totalEl = document.getElementById('total');
const submitBtn = document.getElementById('submit');
const messageEl = document.getElementById('message');
let products = [];

const money = n => '$' + n.toFixed(2);

function setMinPickupDate() {
  const d = new Date();
  d.setDate(d.getDate() + MIN_LEAD_DAYS);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  form.elements.pickupDate.min = local;
}

async function loadMenu() {
  try {
    const res = await fetch(SCRIPT_URL);
    const data = await res.json();
    products = data.products || [];
    renderMenu();
  } catch (err) {
    menuEl.innerHTML = '<p class="error">Could not load the menu. Please try again later.</p>';
  }
}

function renderMenu() {
  menuEl.replaceChildren();
  if (!products.length) {
    menuEl.innerHTML = '<p class="muted">No items available right now.</p>';
    return;
  }
  for (const p of products) {
    const row = document.createElement('div');
    row.className = 'item';

    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = p.name;
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = p.description;
    info.append(name, desc);

    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = money(p.price);

    const qty = document.createElement('input');
    qty.type = 'number';
    qty.min = '0';
    qty.max = '50';
    qty.value = '0';
    qty.dataset.id = p.id;
    qty.setAttribute('aria-label', 'Quantity of ' + p.name);
    qty.addEventListener('input', updateTotal);

    row.append(info, price, qty);
    menuEl.append(row);
  }
  updateTotal();
}

function selectedItems() {
  return [...menuEl.querySelectorAll('input[data-id]')]
    .map(i => ({ id: i.dataset.id, qty: Math.max(0, Math.floor(Number(i.value) || 0)) }))
    .filter(i => i.qty > 0);
}

function updateTotal() {
  const total = selectedItems().reduce((sum, i) => {
    const p = products.find(p => p.id === i.id);
    return sum + (p ? p.price * i.qty : 0);
  }, 0);
  totalEl.textContent = money(total);
  submitBtn.disabled = total === 0;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  messageEl.className = '';
  messageEl.textContent = '';

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = {
    name: form.elements.name.value,
    email: form.elements.email.value,
    phone: form.elements.phone.value,
    pickupDate: form.elements.pickupDate.value,
    notes: form.elements.notes.value,
    website: form.elements.website.value,
    items: selectedItems(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  try {
    // text/plain keeps this a "simple" request so the browser doesn't need a CORS preflight.
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Something went wrong.');
    document.getElementById('order-id').textContent = data.orderId;
    form.hidden = true;
    document.getElementById('done').hidden = false;
  } catch (err) {
    messageEl.className = 'error';
    messageEl.textContent = err.message || 'Could not send your order. Please try again.';
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = 'Place order';
  }
});

setMinPickupDate();
loadMenu();
