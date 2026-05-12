# ClaimWatch SEO/pSEO Design

Date: 2026-05-12
Project: claimwatch-mvp
Domain baseline: https://simon622.shop

## 1) Goals and Success Criteria

Primary goals:
- Make all public indexable pages consistently use `https://simon622.shop` as canonical origin.
- Expand pSEO landing pages to capture long-tail recall/refund/settlement demand.
- Keep quality controls strict enough to reduce thin-content and duplicate-index risk.

Success criteria:
- Canonical, OG, JSON-LD, sitemap, robots, RSS, API URLs use the same domain baseline.
- pSEO hubs exist and are crawlable (`/companies/`, `/sources/*`, `/categories/*`, `/claims/*`, `/topics/`).
- Low-quality candidate groups are not promoted into sitemap.
- Build tests verify domain consistency and core pSEO outputs.

## 2) Target Keywords, Coverage, and Boundaries

### Target keyword clusters
- Intent cluster A (recall): `salmonella`, `listeria`, `allergen`, `product recall`, brand+recall combinations.
- Intent cluster B (refund/claim): `refund program`, `claim deadline`, `settlement payout`, company+settlement combinations.
- Intent cluster C (source-oriented): `FDA recalls`, `CPSC recalls`, `NHTSA recalls`, `FTC refunds`.

### Coverage scope
- Detail pages: `/item/<slug>/`
- Company pages: `/company/<slug>/` and `/companies/`
- Source pages: `/sources/<agency>/`
- Category pages: `/categories/<type>/`
- Query-driven pages: `/claims/<matched-query>/`
- Topic hub: `/topics/`

### Content/index boundaries
- Public SEO pages are based on `officialVerified === true`.
- Trend-only monitoring records remain non-public-index targets.
- Query pages (`/claims/*`) require group quality checks:
  - minimum 2 records OR
  - single record with official source and sufficiently descriptive summary.
- Generic stop terms (e.g., `claim`, `refund`, `recall`, `lawsuit`) are excluded from query-page generation.
- Duplicate query slugs are deduplicated before page generation.

## 3) Approaches Considered (2-3 options)

### Option A: Conservative SEO-only
- Scope: domain/canonical cleanup, metadata unification, sitemap/robots fixes.
- Pros: lowest risk, fastest.
- Cons: weak incremental long-tail traffic growth.

### Option B: Balanced pSEO
- Scope: Option A + selected pSEO pages by company/source/category.
- Pros: moderate growth with manageable quality risk.
- Cons: misses high-intent keyword variants from actual search phrases.

### Option C: Aggressive pSEO with quality gates (Recommended)
- Scope: Option B + query-driven claim pages from matched terms + topic hub.
- Pros: best long-tail capture and internal-link graph depth.
- Cons: higher risk unless strict quality/index gating is enforced.

Recommendation:
- Adopt Option C, but only with explicit indexing boundaries and duplicate/thin-page guards.

## 4) Approved Design

Decision:
- Use Option C (aggressive pSEO with safeguards).
- This aligns with the user direction to proceed with the aggressive path.

Key design elements:
- Single source-of-truth domain from config/env for all absolute URLs.
- Programmatic page families: companies, sources, categories, claims, topics.
- Structured data:
  - `ItemList` for index/collection pages.
  - `BreadcrumbList` on navigational pages.
  - `FAQPage` on pSEO collection pages/hubs.
- Internal linking strategy:
  - Home hero and sidebar link into source and topic hubs.
  - Collection pages include mini-nav links to neighboring hubs.
  - Footer includes Topics and Companies for crawl depth.
- Sitemap policy:
  - include only groups that pass quality thresholds.
  - keep low-confidence pages out of sitemap promotion.

## 5) Error Handling and Data Integrity

- Missing/invalid data files fallback to empty arrays (`readJson` fallback).
- Slug normalization is centralized (`slugify`) to reduce URL drift.
- Query-page generation uses stop-term filters + dedup by slug.
- Empty collections can still render with `noindex,follow` where appropriate.

## 6) Test Strategy

- Build-level test suite (`node --test`) validates:
  - domain consistency (no old preview domain leakage).
  - generation of core pSEO pages.
  - sitemap inclusion of required pSEO routes.
  - presence of key metadata/schema (e.g., `og:site_name`, `FAQPage`).

## 7) Spec Self-Review Checklist

- Placeholder scan: no `TBD`/`TODO` placeholders.
- Internal consistency: architecture, routes, and indexing policy align.
- Scope check: focused on static-site generator SEO/pSEO concerns only.
- Ambiguity check: indexing boundaries and query filters are explicit.

