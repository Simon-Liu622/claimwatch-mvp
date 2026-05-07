# ClaimWatch MVP

ClaimWatch is a static-first MVP for a US consumer recall, refund, and settlement tracker. It uses Template B: consumer-friendly alert cards, strong search, tabs, status chips, and a Google Trends matched strip.

## What It Generates

- SEO pages: home, category pages, item detail pages, company pages, sources, methodology, about
- GEO/LLM files: `llms.txt`, JSON APIs, RSS feed, structured HTML facts, source citations
- Crawl files: `sitemap.xml`, `robots.txt`, `feed.xml`
- APIs: `/api/latest.json`, `/api/items.json`, `/api/items/[slug].json`
- Admin queue: `/admin/` with `noindex,nofollow`

## Data Flow

```text
Google Trends / CSV / RSS
        ↓
filter recall/refund/settlement/payout/lawsuit/claim terms
        ↓
official source APIs and pages
        ↓
merge + verify + score
        ↓
static pages + JSON APIs + sitemap + RSS + llms.txt
```

Trend-only pages stay in `monitoring` status. Items matched to official sources can be marked verified. Public pages only surface `officialVerified: true` records; monitoring candidates are kept for operations and manual review.

## Commands

```bash
npm run build
npm run dev
```

Then open:

```text
http://localhost:5177
```

To refresh data and rebuild:

```bash
npm run refresh
```

## Google Trends Options

The crawler checks sources in this order:

1. `SERPAPI_KEY` for automated Google Trends Trending Now.
2. `TRENDING_CSV_PATH` for a local Google Trends CSV export.
3. Google Trends RSS as a low-detail fallback.

Example:

```bash
TRENDING_CSV_PATH=/Users/simon/Downloads/trending_US_7d_20260507-1415.csv npm run refresh
```

## Official Source Coverage

Current MVP adapters:

- openFDA food enforcement
- openFDA drug enforcement
- openFDA device enforcement
- FTC refund page monitor
- CPSC consumer product recalls
- USDA FSIS recalls and public health alerts
- NHTSA vehicle recalls by configured make/model/year targets

Registry placeholders remain for CFPB, CourtListener, and settlement administrator sources so those adapters can be added next.

## SerpApi Real-Time Trends

For automated Google Trends Trending Now ingestion, set `SERPAPI_KEY`.

```bash
SERPAPI_KEY=xxx SITE_URL=https://yourdomain.com npm run refresh
```

The crawler uses SerpApi first. If no key is present, it falls back to `TRENDING_CSV_PATH`. If neither is present, it uses Google Trends RSS with less detail.

Recommended production schedule:

```text
Every 15-30 minutes:
SERPAPI_KEY=xxx SITE_URL=https://yourdomain.com npm run refresh
```

For Vercel/GitHub Actions/cron, run `npm run refresh`, then deploy or publish the updated `public/` folder.

## NHTSA Vehicle Targets

NHTSA does not expose a simple latest-all-recalls endpoint in the same shape as CPSC/FDA. The MVP polls configured targets and also looks for NHTSA campaign numbers in trend terms.

Configure targets with:

```bash
NHTSA_TARGETS='tesla|model 3|2024;ford|f-150|2024;toyota|camry|2024' npm run refresh
```

Format:

```text
make|model|year;make|model|year
```

## SEO/GEO Notes

- Each detail page has a fact summary table above the fold.
- Each detail page includes canonical URL, JSON-LD Article, breadcrumbs, source labels, last-updated fields, and matched queries.
- `sitemap.xml` updates with item URLs and last modified dates.
- Only verified items are included in the public homepage, `sitemap.xml`, RSS feed, and latest APIs.
- Trend-only monitoring detail pages are generated for review but include `noindex,nofollow`.
- `llms.txt` exposes important URLs and data policy for AI crawlers and retrieval systems.
- JSON APIs make the latest alert data easy to consume by downstream tools.

## Manual Publishing Workflow

Open the admin queue:

```text
http://localhost:5177/admin/
```

Monitoring candidates come from Google Trends and unmatched signals. They are not public SEO inventory.

To publish one manually:

1. Verify the event from an official source.
2. Use the admin page's `Copy publish JSON` button.
3. Paste the official URL and correct `sourceAgency` into `data/items.json`.
4. Set `officialVerified: true`.
5. Run:

```bash
npm run build
```

## Safety

This is an informational site. It should not present legal, medical, or financial advice. Keep trend-only pages in monitoring status until a trusted source is attached.
