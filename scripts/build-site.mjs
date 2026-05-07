import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFFICIAL_SOURCE_LABELS, SITE, TYPE_DESCRIPTIONS, TYPE_LABELS } from "../src/config.mjs";
import { escapeHtml, formatDate, slugify, uniqueBy } from "../src/utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const publicDir = path.join(root, "public");
const siteUrl = (process.env.SITE_URL || SITE.defaultUrl).replace(/\/$/, "");
const now = new Date().toISOString();
let navLinks = [
  { href: "/recalls/", label: "Recalls" },
  { href: "/refunds/", label: "Refunds" },
  { href: "/sources/", label: "Sources" }
];

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  } catch {
    return fallback;
  }
}

async function writePublic(relativePath, content) {
  const target = path.join(publicDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, String(content).replace(/[ \t]+$/gm, ""));
}

function absolute(pathname) {
  return `${siteUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function itemUrl(item) {
  return `/item/${item.slug}/`;
}

function companyUrl(company) {
  return `/company/${slugify(company)}/`;
}

function typeUrl(type) {
  const map = {
    recall: "/recalls/",
    settlement: "/settlements/",
    refund: "/refunds/",
    lawsuit: "/lawsuits/",
    "safety-alert": "/safety-alerts/"
  };
  return map[type] || "/alerts/";
}

function statusLabel(status) {
  return status === "active" ? "Active" : status === "closed" ? "Closed" : status === "deadline-soon" ? "Deadline Soon" : "Monitoring";
}

function typeChip(type) {
  return TYPE_LABELS[type] || "Alert";
}

function shortText(value, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}...`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function sourceCounts(items) {
  return items.reduce((counts, item) => {
    counts[item.sourceAgency] = (counts[item.sourceAgency] || 0) + 1;
    return counts;
  }, {});
}

function typeCounts(items) {
  return items.reduce((counts, item) => {
    counts[item.type] = (counts[item.type] || 0) + 1;
    return counts;
  }, {});
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data, null, 2).replace(/</g, "\\u003c")}</script>`;
}

function layout({ title, description, path: pagePath, children, schema = [], bodyClass = "", robots = "index,follow" }) {
  const canonical = absolute(pagePath);
  const schemaScripts = schema.map(jsonLd).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.name)} Feed" href="${escapeHtml(absolute("/feed.xml"))}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <link rel="stylesheet" href="/assets/styles.css">
  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
  ${schemaScripts}
</head>
<body class="${escapeHtml(bodyClass)}">
  <header class="site-header">
    <a class="brand" href="/" aria-label="ClaimWatch home">
      <span class="brand-mark">CW</span>
      <span>
        <strong>ClaimWatch</strong>
        <small>Consumer alert tracker</small>
      </span>
    </a>
    <nav class="nav">
      ${navLinks.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join("")}
    </nav>
  </header>
  <main>
    ${children}
  </main>
  <footer class="footer">
    <div>
      <strong>ClaimWatch</strong>
      <p>Informational consumer alert database. Not legal, medical, or financial advice.</p>
    </div>
    <nav>
      <a href="/methodology/">Methodology</a>
      <a href="/about/">About</a>
      <a href="/api/latest.json">API</a>
      <a href="/llms.txt">llms.txt</a>
    </nav>
  </footer>
</body>
</html>`;
}

function siteSchema() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: siteUrl,
      description: SITE.description
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/search/?q={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    }
  ];
}

function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.url)
    }))
  };
}

function itemSchema(item) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: item.title,
    description: item.summary,
    dateModified: item.lastUpdated || now,
    datePublished: item.lastUpdated || now,
    author: { "@type": "Organization", name: SITE.name },
    publisher: { "@type": "Organization", name: SITE.name },
    mainEntityOfPage: absolute(itemUrl(item)),
    about: [
      item.company,
      item.brand,
      item.product,
      TYPE_LABELS[item.type] || item.type
    ].filter(Boolean)
  };
}

function sourceBadge(item) {
  const verified = item.officialVerified ? "verified" : "monitoring";
  const text = item.officialVerified ? "Official source" : "Needs official source";
  return `<span class="chip ${verified}">${escapeHtml(text)}</span>`;
}

function itemCard(item) {
  const deadline = item.deadline ? formatDate(item.deadline) : "No deadline listed";
  return `<article class="alert-card" data-type="${escapeHtml(item.type)}" data-status="${escapeHtml(item.status)}" data-source="${escapeHtml(item.sourceAgency)}" data-hidden-initial="${item.initiallyHidden ? "true" : "false"}">
    <div class="card-topline">
      <span class="chip type-${escapeHtml(item.type)}">${escapeHtml(typeChip(item.type))}</span>
      <span class="chip status-${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
      <span class="chip agency">${escapeHtml(item.sourceAgency || "SOURCE")}</span>
      ${sourceBadge(item)}
    </div>
    <h3><a href="${escapeHtml(itemUrl(item))}">${escapeHtml(shortText(item.title, 112))}</a></h3>
    <p>${escapeHtml(shortText(item.summary, 190))}</p>
    <dl class="mini-facts">
      <div><dt>Company</dt><dd>${escapeHtml(item.company || item.brand || "Not specified")}</dd></div>
      <div><dt>Deadline</dt><dd>${escapeHtml(deadline)}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(OFFICIAL_SOURCE_LABELS[item.sourceAgency] || item.sourceAgency || "Monitoring")}</dd></div>
    </dl>
    <div class="card-actions">
      <a class="button primary" href="${escapeHtml(itemUrl(item))}">${item.type === "recall" ? "View affected products" : "Check eligibility"}</a>
      ${item.officialSourceUrl ? `<a class="button ghost" href="${escapeHtml(item.officialSourceUrl)}" rel="nofollow noopener">Official source</a>` : ""}
      ${!item.officialSourceUrl && item.thirdPartySourceUrl ? `<a class="button ghost" href="${escapeHtml(item.thirdPartySourceUrl)}" rel="nofollow noopener">Reference source</a>` : ""}
      ${!item.officialSourceUrl && item.trendExploreUrl ? `<a class="button ghost" href="${escapeHtml(item.trendExploreUrl)}" rel="nofollow noopener">View trend</a>` : ""}
    </div>
  </article>`;
}

function searchPanel(items, trends) {
  const counts = sourceCounts(items);
  const types = typeCounts(items);
  const activeTrendCount = trends.filter((trend) => trend.active).length;
  const filterButtons = [
    { type: "all", label: "All", show: true },
    { type: "recall", label: "Recalls", show: types.recall },
    { type: "safety-alert", label: "Safety Alerts", show: types["safety-alert"] },
    { type: "settlement", label: "Settlements", show: types.settlement },
    { type: "refund", label: "Refunds", show: types.refund }
  ];
  return `<section class="hero-panel">
    <div class="hero-copy">
      <p class="eyebrow">Verified consumer database</p>
      <h1>Official recalls, refunds, and settlement alerts in one searchable index.</h1>
      <p>${escapeHtml(SITE.tagline)} Public pages are source-verified, structured for search engines, and built with machine-readable records for AI retrieval.</p>
      <div class="trust-row" aria-label="Data quality">
        <span>Verified records only</span>
        <span>No trend-only pages indexed</span>
        <span>Updated ${escapeHtml(formatDate(now))}</span>
      </div>
    </div>
    <form class="search-box" role="search" action="/search/" method="get">
      <label for="site-search">Search brand, product, or settlement</label>
      <div class="search-row">
        <input id="site-search" name="q" type="search" placeholder="Search brand, product, or settlement" autocomplete="off">
        <button type="submit">Search</button>
      </div>
      <div class="filters" aria-label="Alert filters">
        ${filterButtons.filter((button) => button.show).map((button, index) => `<button type="button" class="filter${index === 0 ? " active" : ""}" data-filter="${escapeHtml(button.type)}">${escapeHtml(button.label)}</button>`).join("")}
      </div>
    </form>
    <div class="source-strip" aria-label="Verified source coverage">
      <span>Source coverage</span>
      ${Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([source, count]) => `<a href="/sources/">${escapeHtml(source)} <strong>${escapeHtml(count)}</strong></a>`)
        .join("")}
      <em>${escapeHtml(activeTrendCount)} trend candidates monitored privately</em>
    </div>
  </section>`;
}

function searchPage(items) {
  const types = typeCounts(items);
  const filterButtons = [
    { type: "all", label: "All", show: true },
    { type: "recall", label: "Recalls", show: types.recall },
    { type: "safety-alert", label: "Safety Alerts", show: types["safety-alert"] },
    { type: "settlement", label: "Settlements", show: types.settlement },
    { type: "refund", label: "Refunds", show: types.refund }
  ];
  return layout({
    title: "Search ClaimWatch",
    description: "Search official-source verified consumer recalls, refunds, safety alerts, and claim records.",
    path: "/search/",
    robots: "noindex,follow",
    schema: siteSchema(),
    children: `
      <section class="page-intro">
        <p class="eyebrow">Search</p>
        <h1 id="search-heading">Search ClaimWatch</h1>
        <p id="search-count">Search official-source verified records by brand, product, company, source, or alert type.</p>
        <form class="search-box search-page-box" role="search" action="/search/" method="get">
          <label for="site-search">Search verified records</label>
          <div class="search-row">
            <input id="site-search" name="q" type="search" placeholder="Search brand, product, recall, refund, or source" autocomplete="off">
            <button type="submit">Search</button>
          </div>
          <div class="filters" aria-label="Alert filters">
            ${filterButtons.filter((button) => button.show).map((button, index) => `<button type="button" class="filter${index === 0 ? " active" : ""}" data-filter="${escapeHtml(button.type)}">${escapeHtml(button.label)}</button>`).join("")}
          </div>
        </form>
      </section>
      <section id="alert-list" class="cards list-cards">${items.map(itemCard).join("")}</section>
      <script src="/assets/site.js" defer></script>
    `
  });
}

function homePage(items, trends) {
  const activeItems = items;
  const deadlineSoon = items.filter((item) => item.deadline).slice(0, 6);
  const counts = sourceCounts(items);
  const types = typeCounts(items);
  const filterButtons = [
    { type: "all", label: "All", show: true },
    { type: "recall", label: "Recalls", show: types.recall },
    { type: "safety-alert", label: "Safety Alerts", show: types["safety-alert"] },
    { type: "settlement", label: "Settlements", show: types.settlement },
    { type: "refund", label: "Refunds", show: types.refund }
  ];
  const schema = [
    ...siteSchema(),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Latest consumer recall, refund, and settlement alerts",
      itemListElement: activeItems.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absolute(itemUrl(item)),
        name: item.title
      }))
    }
  ];
  return layout({
    title: "ClaimWatch - Recalls, Refunds, and Settlement Alerts",
    description: SITE.description,
    path: "/",
    schema,
    children: `
      ${searchPanel(items, trends)}
      <section class="metrics-row" aria-label="ClaimWatch coverage summary">
        <div><strong>${escapeHtml(formatNumber(items.length))}</strong><span>Verified records</span></div>
        <div><strong>${escapeHtml(formatNumber(types.recall || 0))}</strong><span>Recall notices</span></div>
        <div><strong>${escapeHtml(formatNumber((types.refund || 0) + (types.settlement || 0)))}</strong><span>Refund or claim pages</span></div>
        <div><strong>${escapeHtml(formatNumber(Object.keys(counts).length))}</strong><span>Official source families</span></div>
      </section>
      <section class="content-grid">
        <div class="main-column">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Verified alerts</p>
              <h2>Latest verified items</h2>
            </div>
            <a href="/api/latest.json">JSON API</a>
          </div>
          <div class="tabbar" aria-label="Type filters">
            ${filterButtons.filter((button) => button.show).map((button, index) => `<button type="button" class="${index === 0 ? "active" : ""}" data-filter="${escapeHtml(button.type)}">${escapeHtml(button.label)}</button>`).join("")}
          </div>
          <div id="alert-list" class="cards">${activeItems.map((item, index) => itemCard({ ...item, initiallyHidden: index >= 24 })).join("")}</div>
          ${activeItems.length > 24 ? `<button id="load-more" class="load-more" type="button">Load more verified records</button>` : ""}
        </div>
        <aside class="sidebar">
          <section class="side-panel">
            <h2>Deadline soon</h2>
            ${deadlineSoon.length ? deadlineSoon.map((item) => `<a class="side-link" href="${escapeHtml(itemUrl(item))}"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(formatDate(item.deadline))}</small></a>`).join("") : "<p>No verified deadlines in the current dataset.</p>"}
          </section>
          <section class="side-panel">
            <h2>Official sources</h2>
            <ul class="source-list">
              <li>FDA</li>
              <li>CPSC</li>
              <li>FTC</li>
              <li>USDA FSIS</li>
              <li>NHTSA</li>
            </ul>
          </section>
          <section class="side-panel">
            <h2>Data policy</h2>
            <p>Search trends are used for discovery. Public pages require an official source before they enter the index.</p>
            <a class="button ghost" href="/methodology/">Review methodology</a>
          </section>
        </aside>
      </section>
      <script src="/assets/site.js" defer></script>
    `
  });
}

function adminPage(monitoringItems, trends) {
  return layout({
    title: "Monitoring Queue - ClaimWatch Admin",
    description: "Internal monitoring queue for trend-only consumer alert candidates.",
    path: "/admin/",
    robots: "noindex,nofollow",
    schema: [],
    bodyClass: "admin-page",
    children: `
      <section class="page-intro">
        <p class="eyebrow">Admin</p>
        <h1>Monitoring queue</h1>
        <p>These candidates came from Google Trends or unmatched signals. They are not included in the public homepage, sitemap, latest API, or RSS feed until you attach an official source and mark them verified in <code>data/items.json</code>.</p>
      </section>
      <section class="admin-grid">
        <div class="admin-main">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Source pending</p>
              <h2>Manual review candidates</h2>
            </div>
            <a href="/api/monitoring.json">Monitoring JSON</a>
          </div>
          ${
            monitoringItems
              .map(
                (item) => `<article class="admin-card">
                  <div class="card-topline">
                    <span class="chip type-${escapeHtml(item.type)}">${escapeHtml(typeChip(item.type))}</span>
                    <span class="chip monitoring">Noindex</span>
                    <span class="chip trending">Score ${escapeHtml(item.trendScore || 0)}</span>
                  </div>
                  <h3><a href="${escapeHtml(itemUrl(item))}">${escapeHtml(item.title)}</a></h3>
                  <p>${escapeHtml(item.summary)}</p>
                  <dl class="mini-facts">
                    <div><dt>Query</dt><dd>${escapeHtml(item.product || item.matchedQueries?.[0] || "Unknown")}</dd></div>
                    <div><dt>Volume</dt><dd>${escapeHtml(item.searchVolume || "Unknown")}</dd></div>
                    <div><dt>Source</dt><dd>${escapeHtml(item.sourceAgency || "Monitoring")}</dd></div>
                  </dl>
                  <div class="term-list">${(item.matchedQueries || []).slice(0, 8).map((query) => `<span>${escapeHtml(query)}</span>`).join("")}</div>
                  <div class="card-actions">
                    ${item.trendExploreUrl ? `<a class="button ghost" href="${escapeHtml(item.trendExploreUrl)}" rel="nofollow noopener">View trend</a>` : ""}
                    ${item.thirdPartySourceUrl ? `<a class="button ghost" href="${escapeHtml(item.thirdPartySourceUrl)}" rel="nofollow noopener">Third-party reference</a>` : ""}
                    <button class="button primary copy-json" data-json="${escapeHtml(
                      JSON.stringify({
                        ...item,
                        status: "active",
                        officialVerified: true,
                        officialSourceUrl: "PASTE_OFFICIAL_OR_ADMINISTRATOR_URL_HERE",
                        thirdPartySourceUrl: item.thirdPartySourceUrl || "OPTIONAL_THIRD_PARTY_REFERENCE_URL",
                        sourceAgency: "COURT",
                        sourceConfidence: "official"
                      })
                    )}">Copy publish JSON</button>
                    <button class="button ghost copy-json" data-json="${escapeHtml(
                      JSON.stringify({
                        ...item,
                        officialVerified: false,
                        officialSourceUrl: "",
                        thirdPartySourceUrl: item.thirdPartySourceUrl || "PASTE_THIRD_PARTY_REFERENCE_URL_HERE",
                        sourceConfidence: "third-party-reference"
                      })
                    )}">Copy reference JSON</button>
                  </div>
                </article>`
              )
              .join("") || "<p>No monitoring candidates.</p>"
          }
        </div>
        <aside class="sidebar">
          <section class="side-panel">
            <h2>Manual publish steps</h2>
            <ol class="admin-steps">
              <li>Open the candidate and verify the event from an official source.</li>
              <li>Copy publish JSON.</li>
              <li>Paste official URL and correct agency in <code>data/items.json</code>.</li>
              <li>Set <code>officialVerified: true</code>.</li>
              <li>If you only have a third-party article, use <code>thirdPartySourceUrl</code> and keep <code>officialVerified: false</code>.</li>
              <li>Run <code>npm run build</code> or <code>npm run refresh</code>.</li>
            </ol>
          </section>
          <section class="side-panel">
            <h2>Raw trends</h2>
            <p>Trend data is preserved for operations only.</p>
            <a class="button ghost" href="/api/trends.json">Open trends JSON</a>
          </section>
        </aside>
      </section>
      <script>
        document.querySelectorAll(".copy-json").forEach((button) => {
          button.addEventListener("click", async () => {
            await navigator.clipboard.writeText(JSON.stringify(JSON.parse(button.dataset.json), null, 2));
            button.textContent = "Copied";
          });
        });
      </script>
    `
  });
}

function listPage({ title, description, pagePath, items, type }) {
  const filtered = type ? items.filter((item) => item.type === type) : items;
  const isEmpty = filtered.length === 0;
  const schema = [
    ...siteSchema(),
    breadcrumbSchema([{ name: "Home", url: "/" }, { name: title, url: pagePath }]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: title,
      itemListElement: filtered.slice(0, 50).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absolute(itemUrl(item)),
        name: item.title
      }))
    }
  ];
  return layout({
    title: `${title} - ClaimWatch`,
    description,
    path: pagePath,
    schema,
    children: `
      <section class="page-intro">
        <p class="eyebrow">Consumer alert database</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </section>
      <section class="cards list-cards">${isEmpty ? `<article class="alert-card"><div class="card-topline"><span class="chip monitoring">No verified records yet</span></div><h3>No verified items in this section yet</h3><p>ClaimWatch only publishes official-source verified records in public sections. Trend-only candidates stay out of the public index until an official source is attached.</p><a class="button ghost" href="/sources/">Review source policy</a></article>` : filtered.map(itemCard).join("")}</section>
      <script src="/assets/site.js" defer></script>
    `,
    robots: isEmpty ? "noindex,follow" : "index,follow"
  });
}

function detailPage(item, related) {
  const facts = [
    ["Status", statusLabel(item.status)],
    ["Type", typeChip(item.type)],
    ["Company", item.company || item.brand || "Not specified"],
    ["Product", item.product || "Not specified"],
    ["Remedy", item.remedy || "Not specified"],
    ["Payout", item.payoutAmount || "Not specified"],
    ["Deadline", item.deadline ? formatDate(item.deadline) : "Not listed"],
    ["Source", OFFICIAL_SOURCE_LABELS[item.sourceAgency] || item.sourceAgency || "Monitoring"],
    ["Reference", item.thirdPartySourceUrl ? "Third-party reference attached" : "Not listed"],
    ["Last updated", formatDate(item.lastUpdated)]
  ];
  const schema = [
    ...siteSchema(),
    breadcrumbSchema([
      { name: "Home", url: "/" },
      { name: typeChip(item.type), url: typeUrl(item.type) },
      { name: item.title, url: itemUrl(item) }
    ]),
    itemSchema(item)
  ];
  return layout({
    title: item.title,
    description: item.summary,
    path: itemUrl(item),
    robots: item.officialVerified ? "index,follow" : "noindex,nofollow",
    schema,
    children: `
      <article class="detail">
        <header class="detail-header">
          <div>
            <p class="eyebrow">${escapeHtml(typeChip(item.type))}</p>
            <h1>${escapeHtml(item.title)}</h1>
            <p>${escapeHtml(item.summary)}</p>
            <div class="card-topline">
              <span class="chip status-${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
              ${sourceBadge(item)}
              ${item.searchVolume ? `<span class="chip trending">Trending ${escapeHtml(item.searchVolume)}</span>` : ""}
            </div>
          </div>
          <aside class="fact-box">
            <h2>Fact summary</h2>
            <dl>${facts.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>
          </aside>
        </header>
        <section class="record-banner">
          <div>
            <p class="eyebrow">Verification</p>
            <h2>Official-source record</h2>
            <p>This page is included in the public index because it is tied to a listed official source. ClaimWatch does not publish trend-only candidates to public SEO pages.</p>
          </div>
          <dl>
            <div><dt>Agency</dt><dd>${escapeHtml(item.sourceAgency || "Not specified")}</dd></div>
            <div><dt>Record ID</dt><dd>${escapeHtml(item.officialRecordId || "Not listed")}</dd></div>
            <div><dt>Canonical</dt><dd><a href="${escapeHtml(absolute(itemUrl(item)))}">${escapeHtml(absolute(itemUrl(item)))}</a></dd></div>
          </dl>
        </section>
        <section class="detail-section">
          <h2>What happened?</h2>
          <p>${escapeHtml(item.summary)}</p>
        </section>
        <section class="detail-section">
          <h2>Who may be affected?</h2>
          <p>${escapeHtml(item.affectedPeople || "Consumers covered by the official notice or settlement terms.")}</p>
        </section>
        <section class="detail-section">
          <h2>What should consumers do?</h2>
          <p>${escapeHtml(item.remedy || "Review the official source before taking action.")}</p>
          <div class="button-row">
            ${item.officialClaimUrl ? `<a class="button primary" href="${escapeHtml(item.officialClaimUrl)}" rel="nofollow noopener">Official claim site</a>` : ""}
            ${item.officialSourceUrl ? `<a class="button ghost" href="${escapeHtml(item.officialSourceUrl)}" rel="nofollow noopener">Official source</a>` : ""}
            ${!item.officialSourceUrl && item.thirdPartySourceUrl ? `<a class="button ghost" href="${escapeHtml(item.thirdPartySourceUrl)}" rel="nofollow noopener">Third-party reference</a>` : ""}
            ${!item.officialSourceUrl && item.trendExploreUrl ? `<a class="button ghost" href="${escapeHtml(item.trendExploreUrl)}" rel="nofollow noopener">View Google trend</a>` : ""}
          </div>
        </section>
        <section class="detail-section">
          <h2>Matched search terms</h2>
          <div class="term-list">${(item.matchedQueries || []).map((query) => `<span>${escapeHtml(query)}</span>`).join("") || "<p>No search trend terms attached yet.</p>"}</div>
        </section>
        <section class="detail-section">
          <h2>FAQ</h2>
          <h3>Is this page official?</h3>
          <p>No. ClaimWatch links to official sources and marks whether a page is verified or still being monitored.</p>
          <h3>Is this legal, medical, or financial advice?</h3>
          <p>No. This page is informational. Always confirm eligibility, deadlines, and safety instructions through official sources.</p>
        </section>
        <section class="detail-section">
          <h2>Similar alerts</h2>
          <div class="cards compact">${related.map(itemCard).join("")}</div>
        </section>
      </article>
    `
  });
}

function companyPage(company, items) {
  const pagePath = companyUrl(company);
  return layout({
    title: `${company} recalls, refunds, and settlements`,
    description: `Latest ClaimWatch alerts involving ${company}, including recalls, refunds, lawsuits, and consumer settlements.`,
    path: pagePath,
    schema: [
      ...siteSchema(),
      breadcrumbSchema([{ name: "Home", url: "/" }, { name: company, url: pagePath }]),
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: company,
        url: absolute(pagePath)
      }
    ],
    children: `
      <section class="page-intro">
        <p class="eyebrow">Company page</p>
        <h1>${escapeHtml(company)} alerts</h1>
        <p>Verified recalls, refunds, lawsuits, and settlements involving ${escapeHtml(company)}.</p>
      </section>
      <section class="cards list-cards">${items.map(itemCard).join("")}</section>
    `
  });
}

function simplePage({ title, pagePath, description, body }) {
  return layout({
    title: `${title} - ClaimWatch`,
    description,
    path: pagePath,
    schema: [...siteSchema(), breadcrumbSchema([{ name: "Home", url: "/" }, { name: title, url: pagePath }])],
    children: `
      <section class="page-intro prose">
        <p class="eyebrow">ClaimWatch</p>
        <h1>${escapeHtml(title)}</h1>
        ${body}
      </section>
    `
  });
}

function rss(items) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(SITE.name)}</title>
    <link>${escapeHtml(siteUrl)}</link>
    <description>${escapeHtml(SITE.description)}</description>
    <lastBuildDate>${new Date(now).toUTCString()}</lastBuildDate>
    ${items.slice(0, 50).map((item) => `<item>
      <title>${escapeHtml(item.title)}</title>
      <link>${escapeHtml(absolute(itemUrl(item)))}</link>
      <guid>${escapeHtml(absolute(itemUrl(item)))}</guid>
      <pubDate>${new Date(item.lastUpdated || now).toUTCString()}</pubDate>
      <description>${escapeHtml(item.summary)}</description>
    </item>`).join("\n")}
  </channel>
</rss>`;
}

function sitemap(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${escapeHtml(absolute(url.loc))}</loc>
    <lastmod>${escapeHtml(url.lastmod || now)}</lastmod>
    <changefreq>${escapeHtml(url.changefreq || "daily")}</changefreq>
    <priority>${escapeHtml(url.priority || "0.7")}</priority>
  </url>`).join("\n")}
</urlset>`;
}

function css() {
  return `:root{--bg:#f7f9fc;--surface:#fff;--ink:#172033;--muted:#647084;--line:#dfe5ee;--blue:#246bfe;--blue-dark:#174bc2;--amber:#f59e0b;--green:#15803d;--red:#dc2626;--shadow:0 18px 45px rgba(18,32,54,.08);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f7f9fc}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}.site-header{height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 32px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.94);position:sticky;top:0;z-index:10;backdrop-filter:blur(14px)}.brand{display:flex;align-items:center;gap:12px}.brand-mark{width:38px;height:38px;border-radius:8px;background:#172033;color:#fff;display:grid;place-items:center;font-weight:800}.brand small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.nav{display:flex;gap:20px;color:#344054;font-size:14px}.hero-panel{max-width:1180px;margin:32px auto 18px;padding:30px;background:var(--surface);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);display:grid;grid-template-columns:minmax(260px,1fr) minmax(360px,1.3fr);gap:24px}.eyebrow{text-transform:uppercase;letter-spacing:0;color:var(--blue);font-size:12px;font-weight:800;margin:0 0 10px}.hero-copy h1{font-size:42px;line-height:1.04;margin:0 0 14px;max-width:760px}.hero-copy p{color:var(--muted);font-size:17px;line-height:1.55;margin:0}.trust-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.trust-row span{background:#f8fafc;border:1px solid var(--line);border-radius:999px;color:#334155;font-size:13px;font-weight:750;padding:7px 10px}.search-box{background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:18px}.search-box label{font-weight:750;display:block;margin-bottom:10px}.search-row{display:flex;gap:10px}.search-row input{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:13px 14px;font-size:15px;background:#fff}.search-row button,.button{border:0;border-radius:8px;padding:12px 16px;font-weight:750;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.search-row button,.button.primary{background:var(--blue);color:#fff}.button.primary:hover,.search-row button:hover{background:var(--blue-dark);text-decoration:none}.button.ghost{background:#eef4ff;color:var(--blue)}.load-more{margin:18px auto 0;border:1px solid var(--line);background:#fff;color:var(--blue);border-radius:8px;padding:12px 16px;font-weight:800;cursor:pointer;display:inline-flex}.load-more:hover{background:#eef4ff}.filters,.tabbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.filters button,.tabbar button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:9px 12px;color:#334155;cursor:pointer;font-weight:650}.filters .active,.tabbar .active{background:#e9f0ff;border-color:#a9c0ff;color:#174bc2}.source-strip{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid var(--line);padding-top:16px}.source-strip span{font-size:13px;color:var(--muted);font-weight:750}.source-strip a,.source-strip em{background:#f8fafc;border:1px solid var(--line);color:#334155;border-radius:999px;padding:6px 10px;font-size:13px;font-style:normal}.source-strip strong{color:#172033}.metrics-row{max-width:1180px;margin:0 auto 24px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metrics-row div{background:#fff;border:1px solid var(--line);border-radius:8px;padding:16px}.metrics-row strong{display:block;font-size:26px;line-height:1;color:#172033}.metrics-row span{display:block;color:var(--muted);font-size:13px;font-weight:700;margin-top:7px}.content-grid{max-width:1180px;margin:0 auto 48px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}.section-heading{display:flex;align-items:end;justify-content:space-between;margin:10px 0 16px}.section-heading h2,.side-panel h2{margin:0}.section-heading a{color:var(--blue);font-weight:750}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.list-cards{max-width:1180px;margin:0 auto 48px}.compact{grid-template-columns:repeat(3,minmax(0,1fr))}.alert-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:18px;box-shadow:0 8px 24px rgba(18,32,54,.05);display:flex;flex-direction:column;gap:12px;min-height:320px}.alert-card h3{margin:0;font-size:18px;line-height:1.28}.alert-card p{margin:0;color:var(--muted);line-height:1.5}.card-topline{display:flex;flex-wrap:wrap;gap:7px}.chip{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;border:1px solid var(--line);background:#f8fafc;color:#475569}.chip.verified{background:#ecfdf5;color:#166534;border-color:#bbf7d0}.chip.agency{background:#f1f5f9;color:#334155}.chip.monitoring,.status-monitoring{background:#fff7ed;color:#9a3412;border-color:#fed7aa}.status-active{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.type-recall{background:#fef2f2;color:#991b1b;border-color:#fecaca}.type-settlement{background:#eef4ff;color:#174bc2;border-color:#c7d2fe}.type-refund{background:#ecfdf5;color:#166534;border-color:#bbf7d0}.trending{background:#fff7ed;color:#9a3412}.mini-facts{display:grid;grid-template-columns:1fr;gap:8px;margin:0}.mini-facts div,.fact-box dl div{display:grid;grid-template-columns:96px 1fr;gap:10px}.mini-facts dt,.fact-box dt{font-size:12px;color:var(--muted);font-weight:800;text-transform:uppercase}.mini-facts dd,.fact-box dd{margin:0;font-size:14px}.card-actions,.button-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:auto}.sidebar{display:flex;flex-direction:column;gap:16px}.side-panel{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px}.side-panel p{color:var(--muted);line-height:1.55}.side-link{display:block;padding:12px 0;border-top:1px solid var(--line)}.side-link:first-of-type{border-top:0}.side-link span{display:block;font-weight:750}.side-link small{display:block;color:var(--muted);margin-top:4px}.source-list{margin:10px 0 0;padding-left:18px;color:var(--muted);line-height:1.8}.page-intro{max-width:1180px;margin:32px auto 22px;padding:26px;background:#fff;border:1px solid var(--line);border-radius:8px}.page-intro h1{font-size:38px;margin:0 0 10px}.page-intro p{color:var(--muted);line-height:1.6}.prose{max-width:860px}.prose h2{margin-top:28px}.detail{max-width:1180px;margin:32px auto 50px}.detail-header{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:28px;box-shadow:var(--shadow)}.detail-header h1{font-size:40px;line-height:1.08;margin:0 0 12px}.detail-header p{color:var(--muted);line-height:1.6}.fact-box{background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:18px}.fact-box h2{margin:0 0 12px}.fact-box dl{display:grid;gap:10px;margin:0}.record-banner{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.8fr);gap:20px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:22px;margin-top:18px}.record-banner h2{margin:0 0 8px}.record-banner p{margin:0;color:var(--muted);line-height:1.55}.record-banner dl{margin:0;display:grid;gap:10px}.record-banner div div,.record-banner dl div{display:grid;grid-template-columns:90px 1fr;gap:10px}.record-banner dt{font-size:12px;color:var(--muted);font-weight:800;text-transform:uppercase}.record-banner dd{margin:0;word-break:break-word}.detail-section{background:#fff;border:1px solid var(--line);border-radius:8px;padding:22px;margin-top:18px}.detail-section h2{margin:0 0 12px}.detail-section h3{margin:18px 0 6px}.detail-section p{color:#475569;line-height:1.65}.term-list{display:flex;flex-wrap:wrap;gap:8px}.term-list span{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:999px;padding:6px 10px;font-size:13px}.footer{border-top:1px solid var(--line);background:#fff;padding:26px 32px;display:flex;justify-content:space-between;gap:20px;color:#647084}.footer p{margin:6px 0 0}.footer nav{display:flex;gap:14px;flex-wrap:wrap}.admin-grid{max-width:1180px;margin:0 auto 48px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}.admin-main{display:grid;gap:16px}.admin-card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:18px;box-shadow:0 8px 24px rgba(18,32,54,.05);display:flex;flex-direction:column;gap:12px}.admin-card h3{margin:0;font-size:19px}.admin-card p{margin:0;color:var(--muted);line-height:1.5}.admin-steps{padding-left:20px;color:#475569;line-height:1.7}.admin-steps code,.page-intro code{background:#eef2f7;border:1px solid var(--line);border-radius:6px;padding:1px 5px}@media (max-width:900px){.site-header{height:auto;align-items:flex-start;gap:14px;flex-direction:column;padding:18px}.nav{flex-wrap:wrap}.hero-panel,.content-grid,.detail-header,.record-banner{grid-template-columns:1fr;margin-left:16px;margin-right:16px}.metrics-row{grid-template-columns:repeat(2,minmax(0,1fr));margin-left:16px;margin-right:16px}.hero-copy h1,.detail-header h1{font-size:32px}.cards,.compact{grid-template-columns:1fr}.page-intro,.detail{margin-left:16px;margin-right:16px}.footer{flex-direction:column}.search-row{flex-direction:column}}`;
}

function js() {
  return `const params=new URLSearchParams(location.search);const input=document.querySelector("#site-search");const cards=[...document.querySelectorAll(".alert-card")];const buttons=[...document.querySelectorAll("[data-filter]")];const loadMore=document.querySelector("#load-more");const searchHeading=document.querySelector("#search-heading");const searchCount=document.querySelector("#search-count");let visibleLimit=location.pathname.startsWith("/search/")?9999:24;if(input&&params.get("q")) input.value=params.get("q");function apply(){const q=(input?.value||"").toLowerCase().trim();const active=document.querySelector("[data-filter].active")?.dataset.filter||"all";let shown=0;let matched=0;cards.forEach(card=>{const text=card.textContent.toLowerCase();const type=card.dataset.type;const okText=!q||text.includes(q);const okType=active==="all"||type===active;const ok=okText&&okType;if(ok) matched++;const show=ok&&shown<visibleLimit;if(show) shown++;card.style.display=show?"flex":"none";});if(searchHeading){searchHeading.textContent=q?\`Search results for "\${input.value.trim()}"\`:"Search ClaimWatch";}if(searchCount){searchCount.textContent=q?\`\${matched} verified records matched your search.\`:\`\${matched} verified records available to search.\`;}if(loadMore){loadMore.style.display=matched>visibleLimit?"inline-flex":"none";loadMore.textContent="Load more verified records";}}input?.addEventListener("input",()=>{visibleLimit=location.pathname.startsWith("/search/")?9999:24;apply();});buttons.forEach(btn=>btn.addEventListener("click",()=>{buttons.forEach(b=>b.classList.remove("active"));btn.classList.add("active");visibleLimit=location.pathname.startsWith("/search/")?9999:24;apply();}));loadMore?.addEventListener("click",()=>{visibleLimit+=24;apply();});apply();`;
}

const items = await readJson("items.json", []);
const trends = await readJson("trends.json", []);
const sources = await readJson("source-registry.json", []);
const publicItems = items.filter((item) => item.officialVerified);
const monitoringItems = items.filter((item) => !item.officialVerified);
const countsByType = typeCounts(publicItems);
const deadlineCount = publicItems.filter((item) => item.deadline).length;
navLinks = [
  { href: "/recalls/", label: "Recalls" },
  ...(countsByType["safety-alert"] ? [{ href: "/safety-alerts/", label: "Safety Alerts" }] : []),
  ...(countsByType.settlement ? [{ href: "/settlements/", label: "Settlements" }] : []),
  ...(countsByType.refund ? [{ href: "/refunds/", label: "Refunds" }] : []),
  ...(deadlineCount ? [{ href: "/deadlines/", label: "Deadlines" }] : []),
  { href: "/sources/", label: "Sources" }
];

await fs.rm(publicDir, { recursive: true, force: true });
await fs.mkdir(publicDir, { recursive: true });
await writePublic("assets/styles.css", css());
await writePublic("assets/site.js", js());
await writePublic("google9b173ddcc7370e15.html", "google-site-verification: google9b173ddcc7370e15.html\n");

await writePublic("index.html", homePage(publicItems, trends));
await writePublic("search/index.html", searchPage(publicItems));
await writePublic("recalls/index.html", listPage({ title: "Latest US Recalls", description: TYPE_DESCRIPTIONS.recall, pagePath: "/recalls/", items: publicItems, type: "recall" }));
await writePublic("settlements/index.html", listPage({ title: "Verified Settlements", description: TYPE_DESCRIPTIONS.settlement, pagePath: "/settlements/", items: publicItems, type: "settlement" }));
await writePublic("refunds/index.html", listPage({ title: "Verified Refund Programs and Payment Alerts", description: TYPE_DESCRIPTIONS.refund, pagePath: "/refunds/", items: publicItems, type: "refund" }));
await writePublic("lawsuits/index.html", listPage({ title: "Verified Consumer Lawsuits", description: TYPE_DESCRIPTIONS.lawsuit, pagePath: "/lawsuits/", items: publicItems, type: "lawsuit" }));
await writePublic("safety-alerts/index.html", listPage({ title: "Verified Consumer Safety Alerts", description: TYPE_DESCRIPTIONS["safety-alert"], pagePath: "/safety-alerts/", items: publicItems, type: "safety-alert" }));
await writePublic("deadlines/index.html", listPage({ title: "Claim and Recall Deadlines", description: "Verified consumer alerts with known deadlines, sorted for quick review.", pagePath: "/deadlines/", items: publicItems.filter((item) => item.deadline), type: null }));
await writePublic("trending/index.html", listPage({ title: "Verified Trending Consumer Alerts", description: "Officially verified consumer alerts that are also associated with current search demand.", pagePath: "/trending/", items: publicItems.filter((item) => (item.trendScore || 0) > 0), type: null }));
await writePublic("admin/index.html", adminPage(monitoringItems, trends));

for (const item of items) {
  const relatedPool = item.officialVerified ? publicItems : monitoringItems;
  const related = relatedPool.filter((candidate) => candidate.slug !== item.slug && (candidate.type === item.type || candidate.company === item.company)).slice(0, 3);
  await writePublic(`item/${item.slug}/index.html`, detailPage(item, related));
}

const companyGroups = new Map();
for (const item of items) {
  if (!item.officialVerified) continue;
  const company = item.company || item.brand;
  if (!company) continue;
  if (!companyGroups.has(company)) companyGroups.set(company, []);
  companyGroups.get(company).push(item);
}
for (const [company, companyItems] of companyGroups) {
  await writePublic(`company/${slugify(company)}/index.html`, companyPage(company, companyItems));
}

await writePublic(
  "sources/index.html",
  simplePage({
    title: "Sources",
    pagePath: "/sources/",
    description: "Official sources used by ClaimWatch.",
    body: `<p>ClaimWatch prioritizes official agency and administrator sources. Trend data helps prioritize pages, but official source matching determines whether an alert is marked verified.</p>
      <div class="cards list-cards">${sources.map((source) => `<article class="alert-card"><div class="card-topline"><span class="chip verified">${escapeHtml(source.agency)}</span></div><h3>${escapeHtml(source.name)}</h3><p>${escapeHtml(source.coverage)}</p><a class="button ghost" href="${escapeHtml(source.url)}" rel="nofollow noopener">Open source</a></article>`).join("")}</div>`
  })
);

await writePublic(
  "methodology/index.html",
  simplePage({
    title: "Methodology",
    pagePath: "/methodology/",
    description: "How ClaimWatch collects, verifies, and updates consumer alerts.",
    body: `<p>ClaimWatch combines official consumer protection sources with search trend signals. Google Trends or CSV trend exports help identify what consumers are searching for, while FDA, CPSC, FTC, USDA FSIS, NHTSA, and other sources provide factual verification.</p>
      <h2>Publishing rules</h2>
      <p>Official source matched pages may be marked active or verified. Trend-only pages stay in monitoring status until a trusted source is attached.</p>
      <h2>Update process</h2>
      <p>The crawler can run on a schedule, fetch trend data, ingest official records, update JSON data, rebuild static pages, and refresh sitemap, RSS, API, and llms.txt files.</p>`
  })
);

await writePublic(
  "about/index.html",
  simplePage({
    title: "About",
    pagePath: "/about/",
    description: "About ClaimWatch.",
    body: `<p>ClaimWatch is a lightweight MVP for tracking recalls, refunds, settlements, and consumer claim opportunities in the United States. It is designed for fast indexing, clear citations, and easy extraction by search engines and large language models.</p>`
  })
);

const latest = publicItems.slice(0, 50).map((item) => ({
  title: item.title,
  slug: item.slug,
  url: absolute(itemUrl(item)),
  type: item.type,
  status: item.status,
  company: item.company,
  product: item.product,
  summary: item.summary,
  sourceAgency: item.sourceAgency,
  officialVerified: item.officialVerified,
  officialSourceUrl: item.officialSourceUrl,
  thirdPartySourceUrl: item.thirdPartySourceUrl || "",
  trendExploreUrl: item.trendExploreUrl,
  deadline: item.deadline,
  lastUpdated: item.lastUpdated
}));
const apiItems = publicItems.map((item) => ({
  title: item.title,
  slug: item.slug,
  url: absolute(itemUrl(item)),
  type: item.type,
  status: item.status,
  company: item.company,
  product: item.product,
  summary: item.summary,
  sourceAgency: item.sourceAgency,
  officialVerified: item.officialVerified,
  officialSourceUrl: item.officialSourceUrl,
  thirdPartySourceUrl: item.thirdPartySourceUrl || "",
  trendExploreUrl: item.trendExploreUrl,
  deadline: item.deadline,
  lastUpdated: item.lastUpdated
}));
await writePublic("api/latest.json", `${JSON.stringify({ updatedAt: now, items: latest }, null, 2)}\n`);
await writePublic("api/items.json", `${JSON.stringify({ updatedAt: now, count: publicItems.length, items: apiItems }, null, 2)}\n`);
await writePublic(
  "api/monitoring.json",
  `${JSON.stringify({ updatedAt: now, count: monitoringItems.length, items: monitoringItems.map((item) => ({ ...item, thirdPartySourceUrl: item.thirdPartySourceUrl || "" })) }, null, 2)}\n`
);
await writePublic("api/trends.json", `${JSON.stringify({ updatedAt: now, count: trends.length, trends }, null, 2)}\n`);
for (const item of items) {
  await writePublic(`api/items/${item.slug}.json`, `${JSON.stringify({ updatedAt: now, item: { ...item, url: absolute(itemUrl(item)) } }, null, 2)}\n`);
}

await writePublic("feed.xml", rss(publicItems));
const urls = [
  { loc: "/", priority: "1.0", changefreq: "hourly" },
  { loc: "/recalls/", priority: "0.9" },
  ...(countsByType["safety-alert"] ? [{ loc: "/safety-alerts/", priority: "0.85" }] : []),
  ...(countsByType.settlement ? [{ loc: "/settlements/", priority: "0.9" }] : []),
  ...(countsByType.refund ? [{ loc: "/refunds/", priority: "0.9" }] : []),
  ...(deadlineCount ? [{ loc: "/deadlines/", priority: "0.8" }] : []),
  { loc: "/sources/", priority: "0.6" },
  { loc: "/methodology/", priority: "0.6" },
  ...publicItems.map((item) => ({ loc: itemUrl(item), lastmod: item.lastUpdated || now, priority: "0.85", changefreq: "daily" })),
  ...[...companyGroups.keys()].map((company) => ({ loc: companyUrl(company), priority: "0.65" }))
];
await writePublic("sitemap.xml", sitemap(urls));
await writePublic(
  "robots.txt",
  `User-agent: *
Allow: /

Sitemap: ${absolute("/sitemap.xml")}
`
);
await writePublic(
  "llms.txt",
  `# ClaimWatch

ClaimWatch is a US consumer recall, refund, settlement, and claim deadline tracker.

## Important URLs
- Home: ${absolute("/")}
- Latest JSON: ${absolute("/api/latest.json")}
- All items JSON: ${absolute("/api/items.json")}
- RSS feed: ${absolute("/feed.xml")}
- Sitemap: ${absolute("/sitemap.xml")}
- Methodology: ${absolute("/methodology/")}
- Sources: ${absolute("/sources/")}

## Data Policy
Trend data is used for prioritization. Official source matching is required before an item is marked as verified. Monitoring pages are informational and should not be treated as official legal, medical, or financial advice.

## Current High-Priority Items
${publicItems.slice(0, 20).map((item) => `- ${item.title}: ${absolute(itemUrl(item))}`).join("\n")}
`
);

console.log(`Built ${publicItems.length} public items and ${monitoringItems.length} monitoring items into ${publicDir}`);
