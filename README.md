# Boston 311 Analytics Dashboard

Real-time analytics dashboard for Boston's 311 service requests with a **daily automated data pipeline**.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  GitHub Actions (runs daily at 6 AM UTC / 1 AM EST) │
│                                                     │
│  1. Python fetches all records from Boston 311 API  │
│  2. Writes data/boston_311_requests.csv              │
│  3. Commits CSV to repo                             │
│  4. Builds React dashboard (npm run build)          │
│  5. Copies CSV into dist/data/                      │
│  6. Deploys dist/ to GitHub Pages                   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  GitHub Pages (static site)     │
│                                 │
│  Dashboard loads CSV from       │
│  /data/boston_311_requests.csv   │
│  (falls back to live API)       │
└─────────────────────────────────┘
```

## Quick Start

```bash
npm install
npm run dev          # local dev server at localhost:5173
```

## Deploy to GitHub Pages

### 1. Create repo and push

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/boston-311-dashboard.git
git branch -M main
git push -u origin main
```

### 2. Update base path

In `vite.config.js`, change the `base` to match your repo name:

```js
base: '/boston-311-dashboard/',  // ← your repo name
```

### 3. Enable GitHub Pages

Go to repo **Settings → Pages → Source**: select `gh-pages` branch.

### 4. Enable Actions

Go to repo **Settings → Actions → General** and make sure:
- Actions are enabled
- Workflow permissions = **Read and write permissions**

### 5. Run the pipeline

The pipeline runs automatically every day at 6:00 AM UTC.

To trigger manually: go to **Actions → Daily Data Pipeline → Run workflow**.

Your dashboard will be live at:
`https://YOUR_USERNAME.github.io/boston-311-dashboard/`

## Changing the Schedule

Edit `.github/workflows/daily-pipeline.yml` and modify the cron expression:

```yaml
schedule:
  - cron: "0 6 * * *"   # 6 AM UTC daily
  # - cron: "0 */6 * * *"  # every 6 hours
  # - cron: "0 12 * * 1"   # Mondays at noon
```

Use [crontab.guru](https://crontab.guru/) to build cron expressions.

## Project Structure

```
boston-311-dashboard/
├── .github/workflows/
│   └── daily-pipeline.yml    # GitHub Actions workflow
├── scripts/
│   └── fetch_data.py         # Python data fetcher
├── data/
│   ├── boston_311_requests.csv # Auto-generated daily
│   └── metadata.json         # Fetch timestamp
├── src/
│   ├── main.jsx
│   └── App.jsx               # Dashboard (loads CSV → API fallback)
├── index.html
├── vite.config.js
└── package.json
```

## API Reference

Boston CKAN DataStore API:

```
GET https://data.boston.gov/api/3/action/datastore_search
  ?resource_id=254adca6-64ab-4c5c-9fc0-a6da622be185
  &limit=1000
  &offset=0
```

## License

Data: [Open Data Commons PDDL](http://www.opendefinition.org/licenses/odc-pddl)
