# Badge Tracker — setup guide

## 1. Try it out first (no setup needed)

The app works completely on its own, saving data to your browser, so you
can click around and test everything before wiring up the real backend.

- Download all the files (keep them together in one folder)
- Double-click `index.html` — it opens in your browser
- Add a member, log some badges, play with all three views

Nothing you do here is shared or backed up yet — it's just local to that
one browser, for trying things out.

## 2. Set up the Google Sheet (your shared data)

1. Create a new Google Sheet, name it something like "Guides Badge Tracker"
2. Create four tabs (bottom of the screen, right-click > rename), with
   these exact headers in row 1 of each:

   | Tab name | Headers (row 1) |
   |---|---|
   | `Members` | `id`, `name` |
   | `Statuses` | `memberId`, `badgeId`, `status`, `note`, `month`, `year`, `updatedAt` |
   | `Inventory` | `badgeId`, `stock`, `onOrder`, `lastUpdated` |
   | `ExtraBadges` | `name`, `category` |

3. Leave them otherwise empty — the app fills them in as you use it

## 3. Deploy the backend (Apps Script)

1. In your Sheet, go to **Extensions → Apps Script**
2. Delete the placeholder code, and paste in the contents of
   `apps-script/Code.gs` (from this project)
3. Click **Deploy → New deployment**
4. Click the gear icon next to "Select type" and choose **Web app**
5. Set:
   - **Execute as**: Me
   - **Who has access**: Anyone with the link
6. Click **Deploy**, then **Authorize access** (it's your own script — Google
   will show a warning screen since it's unverified; click "Advanced" then
   "Go to (project name)" to proceed)
7. Copy the **Web app URL** it gives you — looks like
   `https://script.google.com/macros/s/AKfycb.../exec`

Keep this tab open — you'll need to come back and click **Deploy → Manage
deployments → Edit → New version** any time I update `Code.gs` later.

## 4. Connect the frontend to the Sheet

Open `config.js` and paste your Web App URL in:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  UNIT_GUIDE_COUNT: 12,
};
```

Reload `index.html` — it's now reading and writing to your shared Sheet
instead of local storage.

## 5. Publish to GitHub Pages

1. In your GitHub repository, drag in all the project files (`index.html`,
   `styles.css`, `data.js`, `config.js`, `db.js`, `app.js`) — keep them in
   the top level of the repo, not in a subfolder
2. Go to the repo's **Settings → Pages**
3. Under "Source", choose the branch (usually `main`) and folder `/ (root)`
4. Save — GitHub gives you a link like `https://yourname.github.io/repo-name/`

That link is what you share with your co-leaders. Any time I send you
updated files, just drag the new ones into the repo (overwriting the old
ones) and the live link updates within a minute or so.

## Updating later

- **Frontend changes** (styling, layout, new screens): just re-upload the
  changed file(s) to GitHub — no Apps Script redeploy needed
- **Backend changes** (anything in `Code.gs`): paste the new code into
  Apps Script, then **Deploy → Manage deployments → Edit → New version**
