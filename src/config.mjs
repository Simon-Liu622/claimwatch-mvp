export const SITE = {
  name: "ClaimWatch",
  tagline: "Track active recalls, refunds, and settlement claims in one place.",
  description:
    "ClaimWatch is a searchable US consumer alert database for recalls, refunds, settlements, and claim deadlines, built from official sources and current search trend signals.",
  defaultUrl: "https://claimwatch-mvp.vercel.app",
  locale: "en-US",
  author: "ClaimWatch Editorial",
  contact: "editorial@example.com"
};

export const OFFICIAL_SOURCE_LABELS = {
  FDA: "U.S. Food and Drug Administration",
  CPSC: "Consumer Product Safety Commission",
  USDA_FSIS: "USDA Food Safety and Inspection Service",
  NHTSA: "National Highway Traffic Safety Administration",
  FTC: "Federal Trade Commission",
  CFPB: "Consumer Financial Protection Bureau",
  COURT: "Court or settlement administrator",
  COMPANY: "Company notice"
};

export const TYPE_LABELS = {
  recall: "Recall",
  settlement: "Settlement",
  refund: "Refund",
  lawsuit: "Lawsuit",
  "safety-alert": "Safety Alert"
};

export const TYPE_DESCRIPTIONS = {
  recall: "Product and food recalls with affected product details, official source links, and consumer actions.",
  settlement: "Consumer settlements and class action claim opportunities with eligibility, deadlines, and official claim links.",
  refund: "Refund programs and repayment alerts from agencies, companies, and settlement administrators.",
  lawsuit: "Consumer lawsuits and investigations being monitored for settlement or refund updates.",
  "safety-alert": "Public safety alerts that may lead to recalls, refunds, or official consumer instructions."
};

export const FILTER_KEYWORDS = [
  "recall",
  "refund",
  "settlement",
  "payout",
  "class action",
  "lawsuit",
  "claim",
  "claims",
  "deadline",
  "eligibility",
  "customers will receive",
  "contamination",
  "salmonella",
  "listeria",
  "allergen",
  "defective",
  "bricking",
  "hearing"
];

export const TRUSTED_AGENCIES = ["FDA", "CPSC", "USDA_FSIS", "NHTSA", "FTC", "CFPB", "COURT", "COMPANY"];
