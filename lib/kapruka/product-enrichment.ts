import "server-only";

import type { KaprukaProduct } from "@/lib/kapruka/product-normalizer";

const ENRICHMENT_TIMEOUT_MS = 3500;
const MAX_ENRICHED_PRODUCTS = 8;

type ProductPageDetails = {
  displayName: string | null;
  displayImageUrl: string | null;
  description: string | null;
};

export async function enrichKaprukaProducts(
  products: KaprukaProduct[]
): Promise<KaprukaProduct[]> {
  const enrichableProducts = products
    .filter((product) => isKaprukaProductUrl(product.url))
    .slice(0, MAX_ENRICHED_PRODUCTS);
  const detailsById = new Map<string, ProductPageDetails>();

  await Promise.all(
    enrichableProducts.map(async (product) => {
      const details = await fetchProductPageDetails(product.url as string);

      if (details) {
        detailsById.set(product.id, details);
      }
    })
  );

  return products.map((product) => {
    const details = detailsById.get(product.id);

    if (!details) {
      return product;
    }

    return {
      ...product,
      sourceName: product.sourceName || product.name,
      displayName:
        chooseDisplayName(details.displayName, product.name) ||
        product.displayName ||
        null,
      displayImageUrl: details.displayImageUrl || product.displayImageUrl || null,
      description: details.description || product.description || null,
    };
  });
}

async function fetchProductPageDetails(
  url: string
): Promise<ProductPageDetails | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "KaviKaprukaConcierge/0.1",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    return {
      displayName: extractTitle(html),
      displayImageUrl: absolutizeUrl(extractImageUrl(html), url),
      description: extractDescription(html),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractTitle(html: string) {
  const title =
    readMetaContent(html, "property", "og:title") ||
    readMetaContent(html, "name", "twitter:title") ||
    readTagText(html, "h1") ||
    readTagText(html, "title");

  return cleanTitle(title);
}

function extractImageUrl(html: string) {
  return (
    readMetaContent(html, "property", "og:image") ||
    readMetaContent(html, "name", "twitter:image") ||
    readJsonLdImage(html)
  );
}

function extractDescription(html: string) {
  const description =
    readMetaContent(html, "property", "og:description") ||
    readMetaContent(html, "name", "description") ||
    readMetaContent(html, "name", "twitter:description");
  const cleaned = cleanText(description);

  if (!cleaned || cleaned.length < 20) {
    return null;
  }

  return cleaned.slice(0, 280);
}

function readMetaContent(html: string, attrName: "name" | "property", attrValue: string) {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${attrName}=["']${escapeRegExp(attrValue)}["'])(?=[^>]*\\bcontent=["']([^"']+)["'])[^>]*>`,
    "i"
  );
  const reversePattern = new RegExp(
    `<meta\\b(?=[^>]*\\bcontent=["']([^"']+)["'])(?=[^>]*\\b${attrName}=["']${escapeRegExp(attrValue)}["'])[^>]*>`,
    "i"
  );

  return decodeHtmlEntities(html.match(pattern)?.[1] || html.match(reversePattern)?.[1] || "");
}

function readTagText(html: string, tagName: "h1" | "title") {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));

  if (!match?.[1]) {
    return null;
  }

  return decodeHtmlEntities(stripTags(match[1]));
}

function readJsonLdImage(html: string) {
  const scripts = html.match(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
  );

  if (!scripts) {
    return null;
  }

  for (const script of scripts) {
    const jsonText = stripTags(script);

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const image = findJsonLdImage(parsed);

      if (image) {
        return image;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function findJsonLdImage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findJsonLdImage(item);

      if (image) {
        return image;
      }
    }
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const imageValue = record.image;

  if (typeof imageValue === "string") {
    return imageValue;
  }

  return Array.isArray(imageValue) ? findJsonLdImage(imageValue) : null;
}

function cleanTitle(value: string | null) {
  const cleaned = cleanTitleSegment(value);

  if (!cleaned || cleaned.length < 4 || /^kapruka$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function chooseDisplayName(enrichedTitle: string | null, sourceName: string) {
  const cleanedTitle = cleanTitleSegment(enrichedTitle);
  const cleanedSource = cleanTitleSegment(sourceName);

  if (!cleanedTitle || looksSeoLike(cleanedTitle)) {
    return cleanedSource;
  }

  if (!cleanedSource) {
    return cleanedTitle;
  }

  if (looksIncomplete(cleanedTitle) && !looksIncomplete(cleanedSource)) {
    return cleanedSource;
  }

  if (cleanedTitle.length + 8 < cleanedSource.length && !looksIncomplete(cleanedSource)) {
    return cleanedSource;
  }

  if (cleanedTitle.length >= cleanedSource.length || looksIncomplete(cleanedSource)) {
    return cleanedTitle;
  }

  return cleanedSource;
}

function cleanTitleSegment(value: string | null) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return null;
  }

  const candidates = cleaned
    .split("|")
    .map((segment) => cleanTitleMetadata(segment))
    .filter((segment): segment is string => Boolean(segment));
  const bestSegment = candidates
    .filter((segment) => !isMetadataOnlySegment(segment))
    .sort((a, b) => scoreTitleSegment(b) - scoreTitleSegment(a))[0];

  return bestSegment || cleanTitleMetadata(cleaned);
}

function cleanTitleMetadata(value: string) {
  const cleaned = value
    .replace(/\bOnline Price in Sri Lanka\b/gi, "")
    .replace(/\bPrice in Sri Lanka\b/gi, "")
    .replace(/\bKapruka\b/gi, "")
    .replace(/^\s*Flower Republic\s*$/i, "")
    .replace(/\s*-\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function scoreTitleSegment(value: string) {
  const normalized = value.toLowerCase();
  const productWordScore = PRODUCT_NAME_TERMS.reduce(
    (score, term) => score + (normalized.includes(term) ? 3 : 0),
    0
  );
  const metadataPenalty = isMetadataOnlySegment(value) || looksSeoLike(value) ? 20 : 0;

  return value.length + productWordScore - metadataPenalty;
}

function isMetadataOnlySegment(value: string) {
  const normalized = value.toLowerCase().trim();

  return SEO_METADATA_SEGMENTS.some((segment) => normalized === segment);
}

function looksSeoLike(value: string) {
  const normalized = value.toLowerCase();

  return (
    value.includes("|") ||
    normalized.includes("price in sri lanka") ||
    normalized.includes("online price") ||
    normalized === "flowers" ||
    normalized === "kapruka" ||
    normalized === "flower republic"
  );
}

function looksIncomplete(value: string) {
  const normalized = value.toLowerCase().trim();

  return INCOMPLETE_TITLE_ENDINGS.some((ending) => normalized.endsWith(ending));
}

function cleanText(value: string | null) {
  if (!value) {
    return null;
  }

  return decodeHtmlEntities(value)
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);?/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function absolutizeUrl(value: string | null, pageUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, pageUrl).toString();
  } catch {
    return null;
  }
}

function isKaprukaProductUrl(value: string | null): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.hostname.endsWith("kapruka.com");
  } catch {
    return false;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PRODUCT_NAME_TERMS = [
  "bouquet",
  "roses",
  "rose",
  "cake",
  "gift",
  "hamper",
  "chocolate",
  "flowers",
  "arrangement",
];

const SEO_METADATA_SEGMENTS = [
  "flowers",
  "flower republic",
  "kapruka",
  "price in sri lanka",
  "online price in sri lanka",
];

const INCOMPLETE_TITLE_ENDINGS = [
  "bouqu",
  "gift s",
  "gift se",
  "with 25",
  "with 50",
  "with red",
];
