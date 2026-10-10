// Apps Script web app URL (Deploy > Manage deployments). See README.md.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzL0GeWwaxpDciKc5WEKRmpZviYyaDmAluYOIfxZnn6gJGkYwHmhZ4Qts3uzQVcPDWcyA/exec';

const form = document.getElementById('order-form');
const menuEl = document.getElementById('menu');
const pickupEl = document.getElementById('pickup');
const totalEl = document.getElementById('total');
const submitBtn = document.getElementById('submit');
const messageEl = document.getElementById('message');
let products = [];

const money = n => n.toFixed(2).replace('.', ',') + ' $';

function formatDate(iso) {
  const text = new Date(iso + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function choice(type, name, value, text, checked = false) {
  return el('label', { className: 'choice' }, el('input', { type, name, value, checked }), text);
}

const checkedValue = name => form.querySelector(`input[name="${name}"]:checked`)?.value;

async function load() {
  try {
    const res = await fetch(SCRIPT_URL);
    const data = await res.json();
    products = data.products || [];
    renderMenu();
    renderPickup(data.pickupDates || []);
  } catch (err) {
    menuEl.replaceChildren(el('p', { className: 'error', textContent: 'Impossible de charger le menu. Réessayez plus tard.' }));
    pickupEl.replaceChildren();
  }
}

function renderPickup(dates) {
  if (!dates.length) {
    pickupEl.replaceChildren(el('p', { className: 'muted', textContent: 'Aucune date disponible pour le moment.' }));
    return;
  }
  pickupEl.replaceChildren(...dates.map(iso => choice('radio', 'pickupDate', iso, formatDate(iso))));
}

function renderMenu() {
  if (!products.length) {
    menuEl.replaceChildren(el('p', { className: 'muted', textContent: 'Aucun produit disponible pour le moment.' }));
    return;
  }
  const cards = { quantite: quantityCard, melange: mixCard, format: formatCard };
  menuEl.replaceChildren(...products.map((p, i) => cards[p.mode](p, i)));
  update();
}

// One format (checkbox) or several (radios with "Aucun").
function formatChoices(p, i) {
  if (p.formats.length === 1) {
    const f = p.formats[0];
    return choice('checkbox', `f-${i}`, f.label, `${f.label} - ${money(f.price)}`);
  }
  return el('div', { className: 'choices' },
    choice('radio', `f-${i}`, '', 'Aucun', true),
    ...p.formats.map(f => choice('radio', `f-${i}`, f.label, `${f.label} - ${money(f.price)}`)));
}

// Formats plus a flavor radio group when there's more than one flavor.
function formatCard(p, i) {
  const card = el('div', { className: 'product' }, el('h3', { textContent: p.name }));
  if (p.flavors.length === 1) card.append(el('p', { className: 'muted', textContent: p.flavors[0] }));
  card.append(formatChoices(p, i));

  if (p.flavors.length > 1) {
    card.append(el('fieldset', { className: 'flavors', id: `s-${i}` },
      el('legend', { textContent: 'Saveur' }),
      ...p.flavors.map(s => choice('radio', `s-${i}`, s, s))));
  }
  return card;
}

// Pick a box, then fill it with any mix of flavors using - / + steppers.
const mixCounts = {};
const mixSizes = {};
function mixCard(p, i) {
  mixCounts[i] = p.flavors.map(() => 0);
  mixSizes[i] = 0;
  const step = (j, d, text) => el('button', { type: 'button', className: 'step', textContent: text, ariaLabel: `${d > 0 ? 'Ajouter' : 'Retirer'} ${p.flavors[j]}` });
  return el('div', { className: 'product' },
    el('h3', { textContent: p.name }),
    formatChoices(p, i),
    el('fieldset', { className: 'mix', id: `s-${i}` },
      el('legend', { id: `l-${i}` }),
      ...p.flavors.map((s, j) => {
        const minus = step(j, -1, '−');
        const plus = step(j, 1, '+');
        minus.dataset.mix = `${i}:${j}:-1`;
        plus.dataset.mix = `${i}:${j}:1`;
        return el('div', { className: 'mix-row' },
          el('span', { textContent: s }),
          el('span', { className: 'stepper' }, minus, el('output', { id: `c-${i}-${j}`, textContent: '0' }), plus));
      })));
}

const mixSum = i => mixCounts[i].reduce((a, b) => a + b, 0);

menuEl.addEventListener('click', e => {
  const button = e.target.closest('button[data-mix]');
  if (!button) return;
  const [i, j, d] = button.dataset.mix.split(':').map(Number);
  mixCounts[i][j] = Math.max(0, mixCounts[i][j] + d);
  update();
});

// A quantity per flavor (0 to max), with a combined maximum.
function quantityCard(p, i) {
  const unit = p.formats[0];
  const card = el('div', { className: 'product' },
    el('h3', { textContent: p.name }),
    el('p', { className: 'muted', textContent: `${money(unit.price)} chacun, maximum ${p.maxTotal} au total` }));
  p.flavors.forEach((s, j) => {
    const options = [];
    for (let q = 0; q <= p.maxTotal; q++) options.push(choice('radio', `q-${i}-${j}`, String(q), q === 0 ? 'Aucun' : String(q), q === 0));
    card.append(el('div', { className: 'qty-row' }, el('span', { className: 'qty-label', textContent: s }), el('div', { className: 'choices' }, ...options)));
  });
  return card;
}

// Reads the form into order items and the displayed total.
function readOrder() {
  const items = [];
  let total = 0;
  products.forEach((p, i) => {
    if (p.mode === 'quantite') {
      const quantities = {};
      let count = 0;
      p.flavors.forEach((s, j) => {
        const q = Number(checkedValue(`q-${i}-${j}`) || 0);
        if (q > 0) quantities[s] = q;
        count += q;
      });
      if (count) {
        items.push({ id: p.id, quantities });
        total += count * p.formats[0].price;
      }
      return;
    }
    const format = p.formats.find(f => f.label === checkedValue(`f-${i}`));
    if (!format) return;
    if (p.mode === 'melange') {
      const quantities = {};
      p.flavors.forEach((s, j) => mixCounts[i][j] && (quantities[s] = mixCounts[i][j]));
      items.push({ id: p.id, format: format.label, quantities });
    } else {
      items.push({ id: p.id, format: format.label, flavor: p.flavors.length > 1 ? checkedValue(`s-${i}`) : p.flavors[0] });
    }
    total += format.price;
  });
  return { items, total };
}

function update() {
  products.forEach((p, i) => {
    if (p.mode === 'quantite') {
      // Disable quantities that would push the combined total over the max.
      const chosen = p.flavors.map((s, j) => Number(checkedValue(`q-${i}-${j}`) || 0));
      const sum = chosen.reduce((a, b) => a + b, 0);
      p.flavors.forEach((s, j) => {
        form.querySelectorAll(`input[name="q-${i}-${j}"]`).forEach(input => {
          input.disabled = Number(input.value) > p.maxTotal - (sum - chosen[j]);
        });
      });
    } else if (p.mode === 'melange') {
      const size = p.formats.find(f => f.label === checkedValue(`f-${i}`))?.size || 0;
      // A different box size starts the mix over.
      if (size !== mixSizes[i]) {
        mixSizes[i] = size;
        mixCounts[i].fill(0);
      }
      const sum = mixSum(i);
      document.getElementById(`s-${i}`).hidden = !size;
      document.getElementById(`l-${i}`).textContent = `Choisissez vos ${size} saveurs (${sum}/${size})`;
      p.flavors.forEach((s, j) => {
        document.getElementById(`c-${i}-${j}`).textContent = mixCounts[i][j];
        menuEl.querySelector(`[data-mix="${i}:${j}:-1"]`).disabled = mixCounts[i][j] === 0;
        menuEl.querySelector(`[data-mix="${i}:${j}:1"]`).disabled = sum >= size;
      });
    } else if (p.flavors.length > 1) {
      // Flavors only matter once a format is chosen.
      const flavors = document.getElementById(`s-${i}`);
      flavors.hidden = !checkedValue(`f-${i}`);
      if (flavors.hidden) flavors.querySelectorAll('input').forEach(input => (input.checked = false));
    }
  });
  const { total } = readOrder();
  totalEl.textContent = money(total);
  submitBtn.disabled = total === 0;
}

menuEl.addEventListener('change', update);

form.addEventListener('submit', async e => {
  e.preventDefault();
  messageEl.className = 'error';
  messageEl.textContent = '';

  const { items } = readOrder();
  const name = form.elements.name.value.trim();
  const pickupDate = checkedValue('pickupDate');
  const missingFlavor = products.find((p, i) => p.mode === 'format' && p.flavors.length > 1 && checkedValue(`f-${i}`) && !checkedValue(`s-${i}`));
  const incompleteMix = products.findIndex((p, i) => p.mode === 'melange' && mixSizes[i] && mixSum(i) !== mixSizes[i]);

  if (missingFlavor) return void (messageEl.textContent = `Choisissez une saveur pour ${missingFlavor.name}.`);
  if (incompleteMix >= 0) {
    const i = incompleteMix;
    return void (messageEl.textContent = `Choisissez encore ${mixSizes[i] - mixSum(i)} saveur(s) pour ${products[i].name}.`);
  }
  if (!name) return void (messageEl.textContent = 'Votre nom est requis.');
  if (!pickupDate) return void (messageEl.textContent = 'Choisissez une date de cueillette.');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Envoi...';
  try {
    // text/plain keeps this a "simple" request so the browser doesn't need a CORS preflight.
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ name, pickupDate, items, website: form.elements.website.value }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Une erreur est survenue.');
    document.getElementById('order-id').textContent = data.orderId;
    document.getElementById('done-pickup').textContent = formatDate(pickupDate);
    form.hidden = true;
    document.getElementById('done').hidden = false;
  } catch (err) {
    messageEl.textContent = err.message || "Impossible d'envoyer la commande. Réessayez.";
    submitBtn.disabled = false;
  } finally {
    submitBtn.textContent = 'Commander';
  }
});

load();
