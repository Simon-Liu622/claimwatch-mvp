import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

function buildSite() {
  execFileSync("node", ["scripts/build-site.mjs"], {
    cwd: root,
    env: { ...process.env, SITE_URL: "" },
    stdio: "pipe"
  });
}

function readPublic(relativePath) {
  return fs.readFileSync(path.join(publicDir, relativePath), "utf8");
}

function assertPseoFoldersAlignWithSitemap(sitemap, folder, urlPrefix) {
  const dir = path.join(publicDir, folder);
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    const html = readPublic(`${folder}/${slug}/index.html`);
    const canonical = `https://simon622.shop${urlPrefix}${slug}/`;
    const inSitemap = sitemap.includes(canonical);
    if (html.includes('name="robots" content="noindex,follow"')) {
      assert.equal(inSitemap, false, `expected ${canonical} to stay off sitemap (thin pSEO group)`);
    } else if (html.includes('name="robots" content="index,follow"')) {
      assert.equal(inSitemap, true, `expected ${canonical} in sitemap (indexable pSEO group)`);
    } else {
      assert.fail(`unexpected robots meta for ${folder}/${slug}/index.html`);
    }
  }
}

test("build uses simon622.shop as the default public domain", () => {
  buildSite();

  for (const relativePath of ["index.html", "sitemap.xml", "robots.txt", "llms.txt", "api/latest.json"]) {
    const content = readPublic(relativePath);
    assert.match(content, /https:\/\/simon622\.shop/);
    assert.doesNotMatch(content, /claimwatch-mvp\.vercel\.app/);
  }

  const home = readPublic("index.html");
  assert.match(home, /property="og:site_name"/);
});

test("build emits indexable pSEO pages with quality gates", () => {
  buildSite();

  const expectedPages = [
    "companies/index.html",
    "sources/fda/index.html",
    "categories/recall/index.html",
    "claims/salmonella/index.html",
    "topics/index.html"
  ];

  for (const relativePath of expectedPages) {
    const content = readPublic(relativePath);
    assert.match(content, /<meta name="robots" content="index,follow">/);
    assert.match(content, /"FAQPage"/);
  }

  const sitemap = readPublic("sitemap.xml");
  assert.match(sitemap, /https:\/\/simon622\.shop\/companies\//);
  assert.match(sitemap, /https:\/\/simon622\.shop\/sources\/fda\//);
  assert.match(sitemap, /https:\/\/simon622\.shop\/categories\/recall\//);
  assert.match(sitemap, /https:\/\/simon622\.shop\/claims\/salmonella\//);
  assert.match(sitemap, /https:\/\/simon622\.shop\/topics\//);
});

test("Search Console observability page and noindex boundaries", () => {
  buildSite();

  const items = JSON.parse(fs.readFileSync(path.join(root, "data/items.json"), "utf8"));
  const monitoringItem = items.find((item) => !item.officialVerified);
  const verifiedItem = items.find((item) => item.officialVerified);
  assert.ok(monitoringItem, "data/items.json should include at least one monitoring (unverified) row");
  assert.ok(verifiedItem, "data/items.json should include at least one verified row");

  const metrics = JSON.parse(readPublic("api/seo-metrics.json"));
  assert.equal(metrics.siteUrl, "https://simon622.shop");
  const sitemap = readPublic("sitemap.xml");
  const locCount = (sitemap.match(/<loc>/g) || []).length;
  assert.equal(locCount, metrics.inventory.sitemapEntries);

  const observability = readPublic("seo-console/index.html");
  assert.match(observability, /name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(sitemap, /\/seo-console\//);
  assert.doesNotMatch(sitemap, /\/search\//);
  assert.doesNotMatch(sitemap, /\/admin\//);
  assert.ok(
    !sitemap.includes(`https://simon622.shop/item/${monitoringItem.slug}/`),
    "monitoring detail URLs should not be listed in sitemap.xml"
  );

  assert.match(readPublic("search/index.html"), /name="robots" content="noindex,follow"/);
  assert.match(readPublic("admin/index.html"), /name="robots" content="noindex,nofollow"/);
  assert.match(readPublic(`item/${monitoringItem.slug}/index.html`), /name="robots" content="noindex,nofollow"/);
  assert.match(readPublic(`item/${verifiedItem.slug}/index.html`), /name="robots" content="index,follow"/);

  const settlements = readPublic("settlements/index.html");
  const lawsuits = readPublic("lawsuits/index.html");
  if (settlements.includes('name="robots" content="noindex,follow"')) {
    assert.doesNotMatch(sitemap, /https:\/\/simon622\.shop\/settlements\//);
  }
  if (lawsuits.includes('name="robots" content="noindex,follow"')) {
    assert.doesNotMatch(sitemap, /https:\/\/simon622\.shop\/lawsuits\//);
  }

  assertPseoFoldersAlignWithSitemap(sitemap, "sources", "/sources/");
  assertPseoFoldersAlignWithSitemap(sitemap, "categories", "/categories/");

  const claimsDir = path.join(publicDir, "claims");
  for (const ent of fs.readdirSync(claimsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const slug = ent.name;
    const html = readPublic(`claims/${slug}/index.html`);
    assert.match(html, /name="robots" content="index,follow"/, `claim topic ${slug} should be indexable`);
    assert.ok(
      sitemap.includes(`https://simon622.shop/claims/${slug}/`),
      `sitemap should list claim topic /claims/${slug}/`
    );
  }
});
