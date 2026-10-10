# Baking Therapy

A static order page hosted on GitHub Pages. Orders go to a Google Sheet through Google Apps Script. No emails are sent: the baker opens the sheet when she wants.

```
Browser (GitHub Pages) --GET menu / POST order--> Apps Script web app --> Google Sheet (Products + Orders tabs)
```

- **Menu:** edit the `Products` tab in the sheet. Set `available` to `FALSE` to hide an item.
- **Orders:** appear in the `Orders` tab. Use the `status` column however you like (new, ready, picked up).
- **Payment:** taken at pickup (no online payment).

## Setup

### 1. Google Sheet + Apps Script (about 5 min)

Use the Google account that should **own the orders** (ideally the bakery's own account).

1. Create a new Google Sheet, e.g. "Baking Therapy".
2. **Extensions > Apps Script**. Delete the default code and paste in `apps-script/Code.gs`.
3. Optional: set `MIN_LEAD_DAYS` at the top of the file.
4. In the function dropdown pick **`setup`** and click **Run**. Approve the permissions (Google warns about an "unverified app" because you wrote it: **Advanced > Go to project**). This creates the `Products` and `Orders` tabs with sample items.
5. **Deploy > New deployment** > type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the **Web app URL** (ends in `/exec`).

> After changing `Code.gs` later, use **Deploy > Manage deployments > Edit (pencil) > Version: New version**. That keeps the same URL. A *new* deployment gets a new URL.

### 2. Website

1. In `app.js`, replace `PASTE_YOUR_APPS_SCRIPT_URL_HERE` with the web app URL.
2. Test locally: open `index.html` in a browser, place a test order, check that it shows up in the `Orders` tab.

### 3. GitHub Pages

```bash
git init -b main
git add .
git commit -m "Baking Therapy order site"
gh auth login                       # log in with your personal GitHub account
gh repo create baking-therapy --public --source=. --push
```

Then on GitHub: **Settings > Pages > Source: Deploy from a branch > `main` / root > Save**.
After a minute the site is live at `https://<your-username>.github.io/baking-therapy/`.

GitHub Pages on a free account requires a **public** repo. That's fine here: the code contains no secrets. The Apps Script URL is visible to anyone either way, and the script validates every order and recomputes prices from the sheet.

## Notes

- **Customer data** (names, emails, phones) lives only in the Google Sheet. Keep sharing on that sheet restricted. If the bakery is in Quebec, Law 25 applies to that personal info.
- **Spam:** a hidden honeypot field drops basic bots. If spam becomes a problem, add Cloudflare Turnstile.
