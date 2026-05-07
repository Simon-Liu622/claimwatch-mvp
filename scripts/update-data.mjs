import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILTER_KEYWORDS } from "../src/config.mjs";
import {
  cleanText,
  fetchJson,
  fetchText,
  inferSourceAgency,
  inferType,
  parseCsv,
  scoreVolume,
  slugify,
  uniqueBy
} from "../src/utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const now = new Date().toISOString();

const MATCH_KEYWORDS = FILTER_KEYWORDS.map((keyword) => keyword.toLowerCase());

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(path.join(dataDir, file), `${JSON.stringify(data, null, 2)}\n`);
}

function isUsableTrend(text) {
  const haystack = String(text || "").toLowerCase();
  const hardReject =
    /\b(derby|odds|horse|game|score|where to watch|what channel|lineups|match player stats|tickets|presale|met gala|tour)\b/.test(
      haystack
    ) && !/\b(recall|refund|settlement|class action|lawsuit|defective|contamination|salmonella|listeria|allergen)\b/.test(haystack);
  if (hardReject) return false;
  return /\b(recall|refund|settlement|class action|lawsuit|defective|contamination|salmonella|listeria|allergen|customers will receive)\b/.test(
    haystack
  );
}

function trendScore(trend) {
  const volumeScore = Math.min(50, Math.round(scoreVolume(trend.searchVolume) / 40000));
  const activeScore = trend.active ? 15 : 0;
  const keywordScore = Math.min(25, MATCH_KEYWORDS.filter((keyword) => trend.text.includes(keyword)).length * 8);
  const breakdownScore = Math.min(10, (trend.breakdown?.length || 0) * 2);
  return volumeScore + activeScore + keywordScore + breakdownScore;
}

async function loadTrendsFromCsv(csvPath) {
  const text = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(text);
  const headers = rows.shift().map((h) => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  return rows
    .filter((row) => row.length >= headers.length)
    .map((row, index) => {
      const breakdown = String(row[idx["Trend breakdown"]] || "")
        .split(",")
        .map((term) => term.trim())
        .filter(Boolean);
      const text = [row[idx.Trends], ...breakdown].join(" ").toLowerCase();
      return {
        rank: index + 1,
        query: row[idx.Trends],
        searchVolume: row[idx["Search volume"]] || "",
        startedAt: row[idx.Started] || "",
        endedAt: row[idx.Ended] || "",
        active: !row[idx.Ended],
        breakdown,
        exploreUrl: row[idx["Explore link"]]?.startsWith("./")
          ? `https://trends.google.com/trends${row[idx["Explore link"]].slice(1)}`
          : row[idx["Explore link"]] || "",
        source: "google-trends-csv",
        text
      };
    });
}

async function loadTrendsFromSerpApi() {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const geo = process.env.TRENDS_GEO || "US";
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_trends_trending_now");
  url.searchParams.set("geo", geo);
  url.searchParams.set("api_key", key);
  const json = await fetchJson(url);
  const raw = json.trending_searches || json.trending_now || json.trends || json.results || [];
  return raw.map((entry, index) => {
    const query = entry.query || entry.title || entry.keyword || entry.name || entry.search_term || "";
    const breakdown = (
      entry.trend_breakdown ||
      entry.related_queries ||
      entry.queries ||
      entry.searches ||
      entry.related_searches ||
      []
    )
      .map((item) => (typeof item === "string" ? item : item.query || item.title || item.name || item.search_term))
      .filter(Boolean);
    const searchVolume = entry.search_volume || entry.traffic || entry.volume || entry.approx_traffic || "";
    const text = [query, ...breakdown].join(" ").toLowerCase();
    return {
      rank: entry.rank || index + 1,
      query,
      searchVolume,
      startedAt: entry.started || entry.started_at || entry.start_time || "",
      endedAt: entry.ended || entry.ended_at || entry.end_time || "",
      active: entry.active !== false,
      breakdown,
      exploreUrl:
        entry.link ||
        entry.serpapi_google_trends_link ||
        entry.serpapi_link ||
        entry.google_trends_link ||
        "",
      increasePercentage: entry.increase_percentage || entry.percent_increase || "",
      source: "serpapi-google-trends",
      text
    };
  });
}

async function loadTrendsFromRss() {
  const geo = process.env.TRENDS_GEO || "US";
  const xml = await fetchText(`https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`);
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  return itemBlocks.map((block, index) => {
    const get = (tag) => cleanText(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] || "");
    const title = get("title");
    const traffic = get("ht:approx_traffic") || get("approx_traffic");
    const link = get("link");
    const newsTitles = [...block.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)]
      .map((m) => cleanText(m[1]))
      .filter(Boolean);
    const breakdown = uniqueBy([title, ...newsTitles], (x) => x.toLowerCase());
    return {
      rank: index + 1,
      query: title,
      searchVolume: traffic,
      startedAt: "",
      endedAt: "",
      active: true,
      breakdown,
      exploreUrl: link,
      source: "google-trends-rss",
      text: [title, ...breakdown].join(" ").toLowerCase()
    };
  });
}

async function loadTrends() {
  const sources = [];
  try {
    sources.push(...(await loadTrendsFromSerpApi()));
  } catch (error) {
    console.warn(`SerpApi trends skipped: ${error.message}`);
  }
  if (!sources.length && process.env.TRENDING_CSV_PATH) {
    try {
      sources.push(...(await loadTrendsFromCsv(process.env.TRENDING_CSV_PATH)));
    } catch (error) {
      console.warn(`CSV trends skipped: ${error.message}`);
    }
  }
  if (!sources.length) {
    try {
      sources.push(...(await loadTrendsFromRss()));
    } catch (error) {
      console.warn(`RSS trends skipped: ${error.message}`);
    }
  }
  return uniqueBy(
    sources
      .filter((trend) => trend.query && isUsableTrend([trend.query, ...(trend.breakdown || [])].join(" ")))
      .map((trend) => ({ ...trend, trendScore: trendScore(trend), detectedAt: now })),
    (trend) => trend.query.toLowerCase()
  ).sort((a, b) => b.trendScore - a.trendScore);
}

function normalizeOpenFdaRecord(record, sourceUrl, sourceAgency) {
  const productDescription = cleanText(record.product_description || "");
  const reason = cleanText(record.reason_for_recall || "");
  const company = cleanText(record.recalling_firm || "");
  const product = productDescription
    .replace(/\b(ingredients|manufactured by|distributed by|label declares|upc|ndc)\b[\s\S]*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 140);
  const titleProduct = product || productDescription.slice(0, 100) || "FDA recall";
  const title = `${company ? `${company}: ` : ""}${titleProduct} Recall`;
  const slug = slugify(`${company || "fda"} ${titleProduct}`.slice(0, 120));
  return {
    id: slug,
    slug,
    title,
    type: "recall",
    status: record.status?.toLowerCase().includes("ongoing") ? "active" : "monitoring",
    company,
    brand: company,
    product,
    category: "Recall",
    summary: reason
      ? `${reason} Product details: ${productDescription.slice(0, 260)}${productDescription.length > 260 ? "..." : ""}`
      : `FDA enforcement report for ${productDescription.slice(0, 260)}${productDescription.length > 260 ? "..." : ""}`,
    affectedPeople: cleanText(record.distribution_pattern || "Consumers who purchased or received the affected product."),
    remedy: cleanText(record.product_quantity ? `Affected quantity: ${record.product_quantity}` : "Follow official recall instructions."),
    payoutAmount: "Refund, replacement, correction, or disposal if stated by the official notice",
    deadline: null,
    officialClaimUrl: "",
    officialSourceUrl: sourceUrl,
    sourceAgency,
    searchVolume: "",
    trendScore: 0,
    matchedQueries: [],
    officialVerified: true,
    officialRecordId: record.recall_number || record.event_id || "",
    recallInitiationDate: record.recall_initiation_date || record.report_date || "",
    lastUpdated: now
  };
}

async function fetchOpenFdaItems() {
  const endpoints = [
    ["FDA", "https://api.fda.gov/food/enforcement.json?sort=report_date:desc&limit=25"],
    ["FDA", "https://api.fda.gov/drug/enforcement.json?sort=report_date:desc&limit=15"],
    ["FDA", "https://api.fda.gov/device/enforcement.json?sort=report_date:desc&limit=15"]
  ];
  const items = [];
  for (const [agency, url] of endpoints) {
    try {
      const json = await fetchJson(url);
      for (const record of json.results || []) {
        items.push(normalizeOpenFdaRecord(record, url, agency));
      }
    } catch (error) {
      console.warn(`openFDA skipped ${url}: ${error.message}`);
    }
  }
  return items;
}

function normalizeCpscRecord(record) {
  const products = Array.isArray(record.Products) ? record.Products : [];
  const productNames = products.map((product) => cleanText(product.Name || product.Description || "")).filter(Boolean);
  const companies = [
    ...(Array.isArray(record.Manufacturers) ? record.Manufacturers : []),
    ...(Array.isArray(record.Retailers) ? record.Retailers : []),
    ...(Array.isArray(record.Importers) ? record.Importers : []),
    ...(Array.isArray(record.Distributors) ? record.Distributors : [])
  ]
    .map((company) => cleanText(company.Name || company.CompanyName || ""))
    .filter(Boolean);
  const hazards = (Array.isArray(record.Hazards) ? record.Hazards : [])
    .map((hazard) => cleanText(hazard.Name || hazard.HazardType || hazard.Description || ""))
    .filter(Boolean);
  const remedies = (Array.isArray(record.Remedies) ? record.Remedies : [])
    .map((remedy) => cleanText(remedy.Name || remedy.RemedyType || remedy.Description || ""))
    .filter(Boolean);
  const title = cleanText(record.Title || `${productNames[0] || "Consumer Product"} Recall`);
  const company = companies[0] || "";
  const slug = slugify(`cpsc ${record.RecallNumber || record.RecallID || title}`);
  return {
    id: slug,
    slug,
    title: title.includes("Recall") ? title : `${title} Recall`,
    type: "recall",
    status: "active",
    company,
    brand: company,
    product: productNames.slice(0, 3).join("; ") || title,
    category: "Consumer product recall",
    summary: cleanText(record.Description || `${title}. ${hazards.length ? `Hazard: ${hazards.join("; ")}.` : ""}`),
    affectedPeople: productNames.length ? `Consumers who purchased: ${productNames.slice(0, 4).join("; ")}.` : "Consumers who purchased the recalled product.",
    remedy: remedies.length ? remedies.join("; ") : cleanText(record.Remedy || "Follow CPSC recall instructions."),
    payoutAmount: "Repair, refund, replacement, or other remedy if stated by the CPSC notice",
    deadline: null,
    officialClaimUrl: "",
    officialSourceUrl: record.URL || "https://www.cpsc.gov/Recalls",
    sourceAgency: "CPSC",
    searchVolume: "",
    trendScore: 0,
    matchedQueries: [],
    officialVerified: true,
    officialRecordId: record.RecallNumber || String(record.RecallID || ""),
    recallInitiationDate: record.RecallDate || "",
    lastUpdated: now
  };
}

async function fetchCpscItems() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Number(process.env.CPSC_LOOKBACK_DAYS || 180));
  const date = (d) => d.toISOString().slice(0, 10);
  const url = new URL("https://www.saferproducts.gov/RestWebServices/Recall");
  url.searchParams.set("format", "json");
  url.searchParams.set("RecallDateStart", date(start));
  url.searchParams.set("RecallDateEnd", date(end));
  try {
    const json = await fetchJson(url);
    const records = Array.isArray(json) ? json : json.Results || json.results || [];
    return records.slice(0, Number(process.env.CPSC_LIMIT || 60)).map(normalizeCpscRecord);
  } catch (error) {
    console.warn(`CPSC skipped: ${error.message}`);
    return [];
  }
}

function fsisValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      const joined = value
        .map((entry) => (typeof entry === "string" ? entry : entry.value || entry.title || entry.name || entry.target_id || ""))
        .filter(Boolean)
        .join("; ");
      if (joined) return cleanText(joined);
    }
    if (value && typeof value === "object") {
      const nested = value.value || value.title || value.name || value.processed || value[0]?.value;
      if (nested) return cleanText(nested);
    }
    if (value) return cleanText(value);
  }
  return "";
}

function normalizeFsisRecord(record, fallbackUrl = "https://www.fsis.usda.gov/recalls") {
  const title = fsisValue(record, ["title", "recall_title", "field_title", "name"]) || "USDA FSIS Recall or Public Health Alert";
  const company = fsisValue(record, ["field_company", "company", "establishment", "field_establishment"]);
  const recallNumber = fsisValue(record, ["field_recall_number", "recall_number", "number"]);
  const products = fsisValue(record, ["field_products", "products", "impacted_products", "field_impacted_products"]);
  const reason = fsisValue(record, ["field_recall_reason", "reason", "field_summary", "summary", "body"]);
  const states = fsisValue(record, ["field_states", "states"]);
  const risk = fsisValue(record, ["field_risk_level", "risk_level", "risk"]);
  const url = fsisValue(record, ["url", "link", "path"]) || fallbackUrl;
  const officialUrl = url.startsWith("http") ? url : `https://www.fsis.usda.gov${url.startsWith("/") ? url : `/${url}`}`;
  const slug = slugify(`fsis ${recallNumber || title}`);
  return {
    id: slug,
    slug,
    title: title.includes("Recall") || title.includes("Alert") ? title : `${title} Recall`,
    type: "recall",
    status: /closed|terminated|archive/i.test(fsisValue(record, ["field_status", "status"])) ? "closed" : "active",
    company,
    brand: company,
    product: products || title,
    category: "USDA FSIS recall",
    summary: [reason, risk ? `Risk level: ${risk}.` : "", states ? `Distributed in: ${states}.` : ""].filter(Boolean).join(" "),
    affectedPeople: products ? `Consumers who purchased: ${products}.` : "Consumers who purchased the affected meat, poultry, or egg product.",
    remedy: "Do not consume affected products; follow USDA FSIS recall or public health alert instructions.",
    payoutAmount: "Refund, disposal, or return instructions if stated by the official notice",
    deadline: null,
    officialClaimUrl: "",
    officialSourceUrl: officialUrl,
    sourceAgency: "USDA_FSIS",
    searchVolume: "",
    trendScore: 0,
    matchedQueries: [],
    officialVerified: true,
    officialRecordId: recallNumber,
    recallInitiationDate: fsisValue(record, ["field_recall_date", "recall_date", "date"]),
    lastUpdated: now
  };
}

function parseFsisHtml(html) {
  const blocks = [...html.matchAll(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h3>([\s\S]*?)(?=<h3|$)/gi)];
  return blocks.slice(0, 40).map((match) => {
    const url = match[1].startsWith("http") ? match[1] : `https://www.fsis.usda.gov${match[1]}`;
    const title = cleanText(match[2]);
    const block = cleanText(match[3]);
    return normalizeFsisRecord({ title, summary: block.slice(0, 700), url }, url);
  });
}

async function fetchFsisItems() {
  const apiUrl = "https://www.fsis.usda.gov/fsis/api/recall/v/1";
  try {
    const json = await fetchJson(apiUrl, {
      headers: {
        accept: "application/json",
        referer: "https://www.fsis.usda.gov/recalls"
      }
    });
    const records = Array.isArray(json) ? json : json.data || json.results || json.items || json.rows || [];
    return records.slice(0, Number(process.env.FSIS_LIMIT || 50)).map((record) => normalizeFsisRecord(record));
  } catch (error) {
    console.warn(`USDA FSIS API skipped: ${error.message}`);
    try {
      const html = await fetchText("https://www.fsis.usda.gov/recalls", {
        headers: {
          accept: "text/html",
          referer: "https://www.fsis.usda.gov/"
        }
      });
      return parseFsisHtml(html);
    } catch (fallbackError) {
      console.warn(`USDA FSIS page fallback skipped: ${fallbackError.message}`);
      return [];
    }
  }
}

function normalizeNhtsaRecord(record, target = {}) {
  const campaign = cleanText(record.NHTSACampaignNumber || record.CampaignNumber || "");
  const component = cleanText(record.Component || record.component || "Vehicle");
  const manufacturer = cleanText(record.Manufacturer || record.manufacturer || target.make || "");
  const affectedVehicle = [target.year, target.make, target.model].filter(Boolean).join(" ");
  const title = `${manufacturer ? `${manufacturer}: ` : ""}${component} Recall${affectedVehicle ? ` (${affectedVehicle})` : ""}`;
  const slug = slugify(`nhtsa ${campaign || title}`);
  const sourceUrl = campaign
    ? `https://api.nhtsa.gov/recalls/recallsByCampaignNumber?campaignNumber=${encodeURIComponent(campaign)}`
    : `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(target.make || "")}&model=${encodeURIComponent(
        target.model || ""
      )}&modelYear=${encodeURIComponent(target.year || "")}`;
  return {
    id: slug,
    slug,
    title,
    type: "recall",
    status: record.parkIt || record.parkOutSide ? "active" : "monitoring",
    company: manufacturer,
    brand: manufacturer,
    product: affectedVehicle || component,
    category: "Vehicle recall",
    summary: cleanText(record.Summary || record.summary || ""),
    affectedPeople: cleanText(record.Conequence || record.Consequence || record.consequence || "Owners or lessees of affected vehicles."),
    remedy: cleanText(record.Remedy || record.remedy || "Contact the manufacturer or dealer and follow NHTSA recall instructions."),
    payoutAmount: "Free repair, remedy, software update, or dealer service if stated by the NHTSA recall",
    deadline: null,
    officialClaimUrl: "",
    officialSourceUrl: sourceUrl,
    sourceAgency: "NHTSA",
    searchVolume: "",
    trendScore: 0,
    matchedQueries: [],
    officialVerified: true,
    officialRecordId: campaign,
    recallInitiationDate: record.ReportReceivedDate || record.reportReceivedDate || "",
    lastUpdated: now
  };
}

function nhtsaTargetsFromEnv() {
  const raw =
    process.env.NHTSA_TARGETS ||
    "tesla|model 3|2024;ford|f-150|2024;toyota|camry|2024;honda|accord|2024;chevrolet|silverado 1500|2024;hyundai|tucson|2024;kia|telluride|2024;jeep|wrangler|2024";
  return raw
    .split(";")
    .map((entry) => {
      const [make, model, year] = entry.split("|").map((part) => part?.trim()).filter(Boolean);
      return make && model && year ? { make, model, year } : null;
    })
    .filter(Boolean);
}

function nhtsaTargetsFromTrends(trends) {
  const makes = ["tesla", "ford", "toyota", "honda", "chevrolet", "chevy", "hyundai", "kia", "jeep", "bmw", "audi", "nissan"];
  const targets = [];
  for (const trend of trends) {
    const text = [trend.query, ...(trend.breakdown || [])].join(" ").toLowerCase();
    if (!text.includes("recall")) continue;
    for (const make of makes) {
      if (!text.includes(make)) continue;
      const afterMake = text.split(make)[1]?.replace(/\b(recall|vehicle|car|suv|truck|defect|lawsuit)\b/g, " ").trim();
      const model = afterMake?.split(/\s+/).slice(0, 3).join(" ").trim();
      if (model && model.length > 1) targets.push({ make: make === "chevy" ? "chevrolet" : make, model, year: "2024" });
    }
  }
  return targets;
}

async function fetchNhtsaItems(trends = []) {
  const campaignNumbers = uniqueBy(
    trends
      .flatMap((trend) => [trend.query, ...(trend.breakdown || [])].join(" ").match(/\b\d{2}V\d{3}000\b/gi) || [])
      .map((campaign) => campaign.toUpperCase()),
    (campaign) => campaign
  );
  const items = [];
  for (const campaign of campaignNumbers.slice(0, 10)) {
    try {
      const url = `https://api.nhtsa.gov/recalls/recallsByCampaignNumber?campaignNumber=${encodeURIComponent(campaign)}`;
      const json = await fetchJson(url);
      for (const record of json.results || json.Results || []) items.push(normalizeNhtsaRecord(record));
    } catch (error) {
      console.warn(`NHTSA campaign skipped ${campaign}: ${error.message}`);
    }
  }

  const targets = uniqueBy([...nhtsaTargetsFromTrends(trends), ...nhtsaTargetsFromEnv()], (target) =>
    `${target.make}|${target.model}|${target.year}`.toLowerCase()
  ).slice(0, Number(process.env.NHTSA_TARGET_LIMIT || 12));
  for (const target of targets) {
    try {
      const url = new URL("https://api.nhtsa.gov/recalls/recallsByVehicle");
      url.searchParams.set("make", target.make);
      url.searchParams.set("model", target.model);
      url.searchParams.set("modelYear", target.year);
      const json = await fetchJson(url);
      for (const record of json.results || json.Results || []) items.push(normalizeNhtsaRecord(record, target));
    } catch (error) {
      console.warn(`NHTSA skipped ${target.year} ${target.make} ${target.model}: ${error.message}`);
    }
  }
  return uniqueBy(items, (item) => item.slug).slice(0, Number(process.env.NHTSA_LIMIT || 80));
}

async function fetchFtcRefunds() {
  try {
    const html = await fetchText("https://www.ftc.gov/enforcement/refunds");
    const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map((match) => ({
        href: match[1].startsWith("http") ? match[1] : `https://www.ftc.gov${match[1]}`,
        text: cleanText(match[2])
      }))
      .filter((link) => /(refund|payment|consumer|claim|settlement)/i.test(link.text))
      .slice(0, 20);
    return links.map((link) => {
      const slug = slugify(link.text);
      return {
        id: slug,
        slug,
        title: link.text,
        type: inferType(link.text),
        status: "monitoring",
        company: "",
        brand: "",
        product: "FTC refund program",
        category: "FTC refunds",
        summary: `FTC refund or consumer payment program: ${link.text}.`,
        affectedPeople: "Consumers covered by the FTC refund program.",
        remedy: "Refund or payment if eligible under official FTC terms.",
        payoutAmount: "Varies",
        deadline: null,
        officialClaimUrl: link.href,
        officialSourceUrl: link.href,
        sourceAgency: "FTC",
        searchVolume: "",
        trendScore: 0,
        matchedQueries: [],
        officialVerified: true,
        lastUpdated: now
      };
    });
  } catch (error) {
    console.warn(`FTC refunds skipped: ${error.message}`);
    return [];
  }
}

async function fetchOfficialItems(trends = []) {
  const groups = await Promise.all([fetchOpenFdaItems(), fetchFtcRefunds(), fetchCpscItems(), fetchFsisItems(), fetchNhtsaItems(trends)]);
  return uniqueBy(groups.flat(), (item) => item.slug);
}

function matchTrendToItem(trend, item) {
  const trendTerms = [trend.query, ...(trend.breakdown || [])].join(" ").toLowerCase();
  const itemText = [item.title, item.company, item.brand, item.product, item.summary].join(" ").toLowerCase();
  const itemCompanyTokens = new Set(
    [item.company, item.brand]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 3)
  );
  const stopWords = new Set([
    "what",
    "when",
    "where",
    "which",
    "with",
    "from",
    "that",
    "this",
    "have",
    "will",
    "time",
    "news",
    "today",
    "product",
    "products",
    "recall",
    "refund",
    "settlement",
    "class",
    "action",
    "lawsuit",
    "claim",
    "claims",
    "alert",
    "health",
    "official",
    "issued",
    "nationwide"
  ]);
  const trendTokens = new Set(
    trendTerms
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 4 && !stopWords.has(token))
  );
  const exactTermHit = [trend.query, ...(trend.breakdown || [])]
    .map((term) => term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .filter((term) => term.length > 8 && !/(what|when|where|which|who|how)\b/.test(term))
    .some((term) => itemText.includes(term));
  if (exactTermHit) return true;

  let hits = 0;
  let companyHit = false;
  for (const token of trendTokens) {
    if (itemText.includes(token)) {
      hits += 1;
      if (itemCompanyTokens.has(token)) companyHit = true;
    }
  }
  return companyHit && hits >= 2;
}

function trendOnlyItem(trend) {
  const title = trend.query.replace(/\b\w/g, (char) => char.toUpperCase());
  const type = inferType([trend.query, ...(trend.breakdown || [])].join(" "));
  const slug = slugify(trend.query);
  const sourceAgency = inferSourceAgency(trend.exploreUrl, trend.query);
  return {
    id: slug,
    slug,
    title: `${title}: Consumer Alert Monitoring`,
    type,
    status: "monitoring",
    company: "",
    brand: "",
    product: trend.query,
    category: type === "recall" ? "Recall monitoring" : "Consumer monitoring",
    summary:
      "This page was surfaced from current search trends and is held in monitoring status until a matching official source is verified.",
    affectedPeople: "Consumers searching for this alert should confirm details through official sources.",
    remedy: "No consumer action is recommended until an official source is attached.",
    payoutAmount: "Not verified",
    deadline: null,
    officialClaimUrl: "",
    officialSourceUrl: "",
    trendExploreUrl: trend.exploreUrl,
    sourceAgency,
    searchVolume: trend.searchVolume,
    trendScore: trend.trendScore,
    matchedQueries: [trend.query, ...(trend.breakdown || []).slice(0, 8)],
    officialVerified: false,
    lastUpdated: now
  };
}

function mergeItems(existingItems, officialItems, trends) {
  const currentTrendSlugs = new Set(trends.slice(0, 100).map((trend) => slugify(trend.query)));
  const bySlug = new Map(
    existingItems
      .filter((item) => !item.officialVerified && (currentTrendSlugs.has(item.slug) || item.officialClaimUrl))
      .map((item) => [item.slug, item])
  );

  for (const official of officialItems) {
    const matchedTrends = trends.filter((trend) => matchTrendToItem(trend, official));
    const existing = bySlug.get(official.slug) || {};
    bySlug.set(official.slug, {
      ...existing,
      ...official,
      status: matchedTrends.length ? "active" : official.status,
      trendScore: Math.max(existing.trendScore || 0, ...matchedTrends.map((trend) => trend.trendScore), official.trendScore || 0),
      searchVolume: matchedTrends[0]?.searchVolume || existing.searchVolume || "",
      matchedQueries: uniqueBy(matchedTrends.flatMap((trend) => [trend.query, ...(trend.breakdown || []).slice(0, 5)]), (query) =>
        query.toLowerCase()
      ).slice(0, 15),
      lastUpdated: now
    });
  }

  for (const trend of trends.slice(0, 80)) {
    const hasOfficialMatch = [...bySlug.values()].some((item) => item.officialVerified && matchTrendToItem(trend, item));
    if (hasOfficialMatch) continue;
    const slug = slugify(trend.query);
    const existing = bySlug.get(slug);
    const generated = trendOnlyItem(trend);
    bySlug.set(slug, {
      ...existing,
      ...generated,
      matchedQueries: uniqueBy([...(existing?.matchedQueries || []), ...(generated.matchedQueries || [])], (query) => query.toLowerCase())
    });
  }

  return [...bySlug.values()]
    .filter((item) => item.title && item.slug)
    .map((item) => {
      if (!item.officialVerified && item.officialSourceUrl?.includes("trends.google")) {
        return {
          ...item,
          trendExploreUrl: item.trendExploreUrl || item.officialSourceUrl,
          officialSourceUrl: ""
        };
      }
      return item;
    })
    .sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0) || String(b.lastUpdated).localeCompare(String(a.lastUpdated)));
}

const existingItems = await readJson("items.json", []);
const trends = await loadTrends();
const officialItems = await fetchOfficialItems(trends);
const items = mergeItems(existingItems, officialItems, trends);

await writeJson("trends.json", trends);
await writeJson("items.json", items);
await writeJson("update-log.json", {
  updatedAt: now,
  trends: trends.length,
  officialItems: officialItems.length,
  totalItems: items.length,
  trendSources: uniqueBy(trends.map((trend) => trend.source), (source) => source),
  officialSourceCounts: officialItems.reduce((counts, item) => {
    counts[item.sourceAgency] = (counts[item.sourceAgency] || 0) + 1;
    return counts;
  }, {})
});

console.log(`Updated ${items.length} items from ${officialItems.length} official records and ${trends.length} usable trends.`);
