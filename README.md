# Baking Therapy

A static order page (in French) hosted on GitHub Pages. Orders go to a Google Sheet through Google Apps Script. No emails are sent: the baker opens the sheet when she wants.

```
Browser (GitHub Pages) --GET menu / POST order--> Apps Script web app --> Google Sheet (Produits + Commandes tabs)
```

- **Live site:** https://bluffing.github.io/baking-therapy/
- **Orders:** appear in the `Commandes` tab. Use the `statut` column however you like (nouvelle, prête, cueillie).
- **Customer info:** name only.
- **Pickup:** the next Friday or the next Monday (at least 1 day ahead). On Sundays, Thursday replaces Monday. Change `PICKUP_WEEKDAYS` / `SUNDAY_PICKUP_WEEKDAYS` / `MIN_LEAD_DAYS` at the top of `Code.gs`.
- **Payment:** taken at pickup (no online payment).

## Menu (`Produits` tab)

`produits.txt` holds the current menu, tab-separated: click cell **A1** of the `Produits` tab and paste.

| column | meaning |
|---|---|
| `id` | short unique code, no spaces |
| `nom` | name shown on the site |
| `mode` | `format`: pick one format + one flavor. One format shows as a checkbox, several as radio buttons.<br>`melange`: pick one format, then mix flavors to fill it exactly. The box size is the number at the start of the format (`6 biscuits=10` is 6).<br>`quantite`: pick a quantity per flavor, up to `max_total` combined |
| `formats` | `label=price` separated by `;`, e.g. `3 biscuits=5; 6 biscuits=10`. For `quantite`, the unit price, e.g. `1 pain=5` |
| `saveurs` | flavors separated by `;`. Remove one to stop offering it |
| `max_total` | `quantite` only: max combined quantity |
| `disponible` | `oui` to show, `non` to hide |

Changes show on the site immediately, no redeploy needed. Prices are always taken from the sheet, never from the browser.

## Setup

### 1. Google Sheet + Apps Script

Use the Google account that should **own the orders** (ideally the bakery's own account).

1. Create a Google Sheet, e.g. "Baking Therapy".
2. **Extensions > Apps Script**. Replace the code with `apps-script/Code.gs` and save.
3. In the function dropdown pick **`setup`** and click **Run**. Approve the permissions (Google warns about an "unverified app" because you wrote it: **Advanced > Go to project**). This creates the `Produits` and `Commandes` tabs with headers (it renames the old `Products` / `Orders` tabs if they exist).
4. Paste `produits.txt` into cell A1 of `Produits`.
5. **Deploy > New deployment** > type **Web app**, Execute as: **Me**, Who has access: **Anyone**. Copy the URL (ends in `/exec`) into `SCRIPT_URL` in `app.js`.

> After changing `Code.gs`, use **Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy**. That keeps the same URL. A *new* deployment gets a new URL.

### 2. GitHub Pages

The repo is `Bluffing/baking-therapy` (public, required for free GitHub Pages; the code holds no secrets). Pages serves `main` / root. Push to `main` and the site updates within a minute.

## Notes

- **Customer data** (names) lives only in the Google Sheet. Keep sharing on that sheet restricted.
- **Spam:** a hidden honeypot field drops basic bots. If spam becomes a problem, add Cloudflare Turnstile.
