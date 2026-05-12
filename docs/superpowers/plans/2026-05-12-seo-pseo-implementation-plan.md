# SEO/pSEO Implementation Plan

Date: 2026-05-12
Depends on: `docs/superpowers/specs/2026-05-12-seo-pseo-design.md`

## 1) Implementation Stages

### Stage 1: Domain baseline unification
- Set default domain to `https://simon622.shop`.
- Ensure generated canonical/OG/JSON-LD/sitemap/robots/rss/api/llms outputs use this domain.
- Update environment examples and CI fallback site URL.

Status: Completed

### Stage 2: pSEO page family expansion
- Add generated pages:
  - `/companies/`
  - `/sources/<agency>/`
  - `/categories/<type>/`
  - `/claims/<query>/`
  - `/topics/`
- Add internal links from home/collections/footer.

Status: Completed

### Stage 3: quality and index policy
- Apply query stop-term filtering.
- Deduplicate claim pages by slug.
- Enforce group quality gate before sitemap promotion.
- Keep non-qualified pages from aggressive index promotion.

Status: Completed

### Stage 4: schema and metadata hardening
- Add/confirm:
  - `og:site_name`
  - `ItemList`/`BreadcrumbList` for navigational pages
  - `FAQPage` for pSEO collection hubs

Status: Completed

### Stage 5: test-first and verification loop
- Add/extend build tests around:
  - domain consistency
  - expected pSEO page generation
  - sitemap coverage for pSEO routes
  - schema/meta invariants
- Run tests and confirm green.

Status: Completed

## 2) Test-First Execution Record

Notes:
- A build-level test file was added: `test/build-site.test.mjs`.
- Tests were used to lock expected behavior for domain output and pSEO route generation.
- Additional assertions were introduced for metadata/schema coverage.

Evidence command:
- `npm test`

Expected result:
- 2 tests pass, 0 fail.

## 3) Files in Scope

Primary implementation files:
- `src/config.mjs`
- `src/utils.mjs`
- `scripts/build-site.mjs`
- `.env.example`
- `.github/workflows/refresh-trends.yml`
- `test/build-site.test.mjs`

Generated outputs (from build):
- `public/**` including `sitemap.xml`, `robots.txt`, `llms.txt`, and pSEO page trees.

## 4) Risks and Guardrails

Known residual risks:
- Query-derived pages may still skew toward repetitive templates if data quality drops.
- Overly broad query sets could increase crawl budget pressure.

Guardrails:
- Keep stop-term list conservative and revise periodically.
- Keep sitemap inclusion gated by quality checks.
- Prefer adding stronger content fields to data records over increasing page count.

## 5) Rollback and Iteration

Rollback path:
- Disable or narrow `/claims/*` generation first if quality signals decline.
- Keep core company/source/category pages active (higher trust and stability).

Iteration queue:
- Add quality score thresholds per page family.
- Add more granular tests for non-indexable edge groups.
- Track search console signals and trim low-value templates.

