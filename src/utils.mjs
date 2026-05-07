export function slugify(input) {
  return String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "item";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDate(value) {
  if (!value) return "Not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function scoreVolume(volume) {
  const map = {
    "5M+": 5000000,
    "2M+": 2000000,
    "1M+": 1000000,
    "500K+": 500000,
    "200K+": 200000,
    "100K+": 100000,
    "50K+": 50000,
    "20K+": 20000,
    "10K+": 10000,
    "5K+": 5000,
    "2K+": 2000,
    "1K+": 1000,
    "500+": 500,
    "200+": 200,
    "100+": 100
  };
  return map[String(volume || "").trim()] || Number(volume) || 0;
}

export function inferType(text) {
  const haystack = String(text || "").toLowerCase();
  if (/(recall|salmonella|listeria|undeclared|allergen|contamination|contaminated)/.test(haystack)) return "recall";
  if (/(settlement|class action|payout)/.test(haystack)) return "settlement";
  if (/(refund|repayment|return for a refund)/.test(haystack)) return "refund";
  if (/(lawsuit|trial|hearing|verdict)/.test(haystack)) return "lawsuit";
  return "safety-alert";
}

export function inferSourceAgency(url = "", text = "") {
  const source = `${url} ${text}`.toLowerCase();
  if (source.includes("fda.gov") || source.includes("openfda")) return "FDA";
  if (source.includes("cpsc.gov")) return "CPSC";
  if (source.includes("fsis.usda.gov") || source.includes("usda.gov")) return "USDA_FSIS";
  if (source.includes("nhtsa.gov")) return "NHTSA";
  if (source.includes("ftc.gov")) return "FTC";
  if (source.includes("consumerfinance.gov")) return "CFPB";
  if (source.includes("court") || source.includes("settlement")) return "COURT";
  return "COMPANY";
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function fetchJson(url, options = {}) {
  const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "ClaimWatchMVP/0.1 (+https://example.com; consumer alert crawler)",
        accept: "application/json,text/plain,*/*",
        ...options.headers
      },
      signal: controller.signal,
      ...options
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url, options = {}) {
  const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 12000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "ClaimWatchMVP/0.1 (+https://example.com; consumer alert crawler)",
        accept: "application/rss+xml,application/xml,text/html,text/plain,*/*",
        ...options.headers
      },
      signal: controller.signal,
      ...options
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
