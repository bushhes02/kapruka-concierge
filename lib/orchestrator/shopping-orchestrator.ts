import "server-only";

import { groupProducts } from "@/lib/commerce/product-grouping";
import { extractShoppingIntent } from "@/lib/ai/groq-client";
import { generateKaviAssistantMessage } from "@/lib/ai/gemini-client";
import type { ShoppingIntent } from "@/lib/ai/intent-schema";
import { searchKaprukaProducts } from "@/lib/kapruka/mcp-client";
import type { KaprukaProduct } from "@/lib/kapruka/product-normalizer";

export type ShoppingOrchestratorResult = {
  intent: ShoppingIntent;
  delivery: DeliveryInfo;
  assistantMessage: string;
  products: KaprukaProduct[];
  groups: ReturnType<typeof groupProducts>;
};

export type DeliveryInfo = {
  city: string | null;
  date: string | null;
  isComplete: boolean;
  missingFields: Array<"city" | "deliveryDate">;
  note: string;
};

export async function runShoppingOrchestrator(
  rawQuery: string
): Promise<ShoppingOrchestratorResult> {
  const extractedIntent = await extractShoppingIntent(rawQuery);
  const delivery = resolveDeliveryInfo(extractedIntent);
  const intent = {
    ...extractedIntent,
    city: delivery.city,
    deliveryDate: delivery.date,
  };
  const kaprukaQuery = buildKaprukaQuery(intent);
  const searchedProducts = await searchKaprukaProducts(kaprukaQuery);
  const relevantProducts = await getRelevantProducts(
    searchedProducts,
    intent,
    kaprukaQuery
  );
  const products = filterProductsByBudget(relevantProducts, intent);
  const groups = groupProducts(products, kaprukaQuery, {
    recipient: intent.recipient,
    requestText: getIntentText(intent),
  });
  const assistantMessage = await generateKaviAssistantMessage({
    intent,
    delivery,
    groups,
  });

  return {
    intent,
    delivery,
    assistantMessage,
    products,
    groups,
  };
}

function buildKaprukaQuery(intent: ShoppingIntent) {
  return intent.category || intent.searchQuery || intent.rawQuery;
}

async function getRelevantProducts(
  products: KaprukaProduct[],
  intent: ShoppingIntent,
  originalQuery: string
) {
  const categoryRule = getCategoryRule(intent);

  if (!categoryRule) {
    return products;
  }

  let mergedProducts = products;
  let relevantProducts = filterProductsByCategory(mergedProducts, categoryRule);

  for (const fallbackQuery of buildFallbackQueries(categoryRule, originalQuery)) {
    if (relevantProducts.length >= 3) {
      break;
    }

    const fallbackProducts = await searchKaprukaProducts(fallbackQuery);
    mergedProducts = mergeProducts(mergedProducts, fallbackProducts);
    relevantProducts = filterProductsByCategory(mergedProducts, categoryRule);
  }

  return relevantProducts;
}

function filterProductsByBudget(
  products: KaprukaProduct[],
  intent: ShoppingIntent
) {
  if (typeof intent.budgetMax !== "number") {
    return products;
  }

  return products.filter((product) => {
    return typeof product.price !== "number" || product.price <= intent.budgetMax!;
  });
}

function resolveDeliveryInfo(intent: ShoppingIntent): DeliveryInfo {
  const requestText = getIntentText(intent);
  const city = normalizeCity(intent.city) || extractCityFromRequest(intent.rawQuery);
  const date = resolveDeliveryDate(intent.deliveryDate, requestText);
  const missingFields: DeliveryInfo["missingFields"] = [];

  if (!city) {
    missingFields.push("city");
  }

  if (!date) {
    missingFields.push("deliveryDate");
  }

  return {
    city,
    date,
    isComplete: missingFields.length === 0,
    missingFields,
    note:
      missingFields.length === 0
        ? "Delivery city and date were resolved from the request."
        : `Missing delivery ${missingFields.join(" and ")}.`,
  };
}

function resolveDeliveryDate(groqDate: string | null, requestText: string) {
  const today = getLocalDateOnly(new Date());

  if (requestText.includes("day after tomorrow")) {
    return formatDate(addDays(today, 2));
  }

  if (requestText.includes("tomorrow")) {
    return formatDate(addDays(today, 1));
  }

  if (requestText.includes("today")) {
    return formatDate(today);
  }

  const requestIsoDate = extractIsoDate(requestText);

  if (requestIsoDate && !isBeforeDate(requestIsoDate, today)) {
    return formatDate(requestIsoDate);
  }

  const normalizedGroqDate = parseIsoDate(groqDate);

  if (normalizedGroqDate && !isBeforeDate(normalizedGroqDate, today)) {
    return formatDate(normalizedGroqDate);
  }

  return null;
}

function getLocalDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function extractIsoDate(value: string) {
  const match = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  return match ? parseIsoDate(match[0]) : null;
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function isBeforeDate(date: Date, comparisonDate: Date) {
  return formatDate(date) < formatDate(comparisonDate);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeCity(value: string | null) {
  if (!value || normalize(value) === "null") {
    return null;
  }

  return toTitleCase(value);
}

function extractCityFromRequest(rawQuery: string) {
  const match = rawQuery.match(
    /\b(?:to|in|near)\s+([a-zA-Z][a-zA-Z\s]+?)(?=\s+(?:today|tomorrow|day after tomorrow|on\s+\d{4}-\d{1,2}-\d{1,2})\b|$|[,.!?])/
  );

  if (!match?.[1]) {
    return null;
  }

  return toTitleCase(match[1]);
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

type CategoryRule = {
  category: "cakes" | "flowers" | "hampers";
  includeTerms: string[];
  excludeTerms: string[];
  fallbackQueries: string[];
  requestText: string;
  requiresChocolate?: boolean;
  preferredIdPrefixes?: string[];
};

function getCategoryRule(intent: ShoppingIntent): CategoryRule | null {
  const requestText = getIntentText(intent);

  if (isCakeIntent(requestText) && !isCakeAccessoryIntent(requestText)) {
    return {
      category: "cakes",
      includeTerms: EDIBLE_CAKE_TERMS,
      excludeTerms: CAKE_EXCLUDED_PRODUCT_TERMS,
      fallbackQueries: requestText.includes("birthday")
        ? ["birthday cake", "cake"]
        : ["cake", "birthday cake"],
      requestText,
      preferredIdPrefixes: ["CAKE"],
    };
  }

  if (isFlowerIntent(requestText)) {
    return {
      category: "flowers",
      includeTerms: FLOWER_INCLUDE_TERMS,
      excludeTerms: FLOWER_EXCLUDE_TERMS,
      fallbackQueries: ["flower bouquet", "anniversary flowers", "roses"],
      requestText,
      preferredIdPrefixes: ["FLOWER", "FL"],
    };
  }

  if (isHamperOrChocolateIntent(requestText) && !isGroceryIntent(requestText)) {
    return {
      category: "hampers",
      includeTerms: HAMPER_INCLUDE_TERMS,
      excludeTerms: [
        ...GROCERY_STAPLE_TERMS,
        ...(isChocolateRequest(requestText) ? NON_CHOCOLATE_HAMPER_TERMS : []),
      ],
      fallbackQueries: [
        "chocolate gift",
        "chocolate box",
        "chocolate bouquet",
        "Ferrero Rocher",
        "Cadbury chocolate",
      ],
      requestText,
      requiresChocolate: isChocolateRequest(requestText),
    };
  }

  return null;
}

function filterProductsByCategory(
  products: KaprukaProduct[],
  rule: CategoryRule
) {
  return products
    .filter((product) => isRelevantProductForCategory(product, rule))
    .sort((a, b) => scoreProductForCategory(b, rule) - scoreProductForCategory(a, rule));
}

function isRelevantProductForCategory(product: KaprukaProduct, rule: CategoryRule) {
  const productText = getProductText(product);
  const name = normalize(product.name);

  if (
    rule.category === "cakes" &&
    product.id.toUpperCase().startsWith("PC")
  ) {
    return false;
  }

  if (rule.excludeTerms.some((term) => name.includes(term))) {
    return false;
  }

  if (
    rule.category === "hampers" &&
    rule.requiresChocolate &&
    !hasChocolateSignal(productText)
  ) {
    return false;
  }

  if (
    rule.category === "hampers" &&
    isDadRecipientRequest(rule.requestText) &&
    hasWrongRecipientSignal(name, DAD_WRONG_RECIPIENT_TERMS)
  ) {
    return false;
  }

  return (
    hasPreferredIdPrefix(product, rule) ||
    rule.includeTerms.some((term) => productText.includes(term))
  );
}

function scoreProductForCategory(product: KaprukaProduct, rule: CategoryRule) {
  const productText = getProductText(product);
  const includeScore = rule.includeTerms.reduce(
    (score, term) => score + (productText.includes(term) ? 1 : 0),
    0
  );
  const preferredIdScore = hasPreferredIdPrefix(product, rule) ? 100 : 0;
  const recipientScore =
    rule.category === "hampers" && isDadRecipientRequest(rule.requestText)
      ? scoreTerms(productText, DAD_PREFERRED_TERMS) * 20
      : 0;
  const giftLikeScore =
    rule.category === "hampers" ? scoreTerms(productText, GIFT_LIKE_TERMS) * 8 : 0;
  const priceScore =
    typeof product.price === "number" ? 1 / Math.max(product.price, 1) : 0;

  return preferredIdScore + recipientScore + giftLikeScore + includeScore + priceScore;
}

function scoreTerms(value: string, terms: string[]) {
  return terms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0);
}

function hasPreferredIdPrefix(product: KaprukaProduct, rule: CategoryRule) {
  if (!rule.preferredIdPrefixes) {
    return false;
  }

  const productId = product.id.toUpperCase();
  return rule.preferredIdPrefixes.some((prefix) =>
    productId.startsWith(prefix.toUpperCase())
  );
}

function buildFallbackQueries(rule: CategoryRule, originalQuery: string) {
  const normalizedOriginalQuery = normalize(originalQuery);

  return rule.fallbackQueries.filter(
    (query, index) =>
      rule.fallbackQueries.indexOf(query) === index &&
      normalize(query) !== normalizedOriginalQuery
  );
}

function getIntentText(intent: ShoppingIntent) {
  return normalize(
    [intent.rawQuery, intent.searchQuery, intent.category].filter(Boolean).join(" ")
  );
}

function getProductText(product: KaprukaProduct) {
  return normalize(
    [product.id, product.name, stringifyProductRaw(product.raw)].join(" ")
  );
}

function stringifyProductRaw(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isCakeIntent(requestText: string) {
  return requestText.includes("cake");
}

function isCakeAccessoryIntent(requestText: string) {
  return CAKE_ACCESSORY_REQUEST_TERMS.some((term) => requestText.includes(term));
}

function isFlowerIntent(requestText: string) {
  return FLOWER_INTENT_TERMS.some((term) => requestText.includes(term));
}

function isHamperOrChocolateIntent(requestText: string) {
  return HAMPER_INTENT_TERMS.some((term) => requestText.includes(term));
}

function isChocolateRequest(requestText: string) {
  return requestText.includes("chocolate") || requestText.includes("chocolates");
}

function hasChocolateSignal(productText: string) {
  return CHOCOLATE_SIGNAL_TERMS.some((term) => productText.includes(term));
}

function isDadRecipientRequest(requestText: string) {
  return DAD_REQUEST_TERMS.some((term) => requestText.includes(term));
}

function hasWrongRecipientSignal(productName: string, terms: string[]) {
  return terms.some((term) => productName.includes(term));
}

function isGroceryIntent(requestText: string) {
  return GROCERY_INTENT_TERMS.some((term) => requestText.includes(term));
}

function mergeProducts(
  products: KaprukaProduct[],
  fallbackProducts: KaprukaProduct[]
) {
  const seen = new Set<string>();

  return [...products, ...fallbackProducts].filter((product) => {
    const key = product.id || product.name;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalize(value: string | null) {
  return (value || "").toLowerCase();
}

const CAKE_ACCESSORY_REQUEST_TERMS = [
  "accessory",
  "accessories",
  "topper",
  "mold",
  "mould",
  "decorating",
  "nozzle",
  "knife",
  "turntable",
  "candle",
  "egg beater",
  "tool set",
  "baking",
];

const CAKE_EXCLUDED_PRODUCT_TERMS = [
  "topper",
  "mold",
  "mould",
  "decorating",
  "nozzle",
  "knife",
  "turntable",
  "table",
  "candle",
  "cupcake molds",
  "egg beater",
  "tool set",
  "baking",
];

const EDIBLE_CAKE_TERMS = [
  "cake",
  "ribbon cake",
  "chocolate cake",
  "bento cake",
  "gateaux",
  "cheesecake",
  "birthday cake",
];

const FLOWER_INTENT_TERMS = [
  "flower",
  "flowers",
  "bouquet",
  "rose",
  "roses",
  "floral",
  "anniversary",
  "romantic",
];

const FLOWER_INCLUDE_TERMS = [
  "bouquet",
  "roses",
  "rose",
  "flower arrangement",
  "flowers",
  "floral",
  "basket",
  "anniversary",
];

const FLOWER_EXCLUDE_TERMS = [
  "hair clip",
  "clips",
  "planter",
  "plant",
  "artificial",
  "vase only",
  "pot",
  "seeds",
];

const HAMPER_INTENT_TERMS = [
  "hamper",
  "hampers",
  "chocolate",
  "chocolates",
  "gift hamper",
  "gift box",
  "gift basket",
  "confectionery",
  "sweets",
];

const HAMPER_INCLUDE_TERMS = [
  "hamper",
  "kitkat",
  "kit kat",
  "chocolate",
  "chocolates",
  "rocher",
  "ferrero",
  "cadbury",
  "toblerone",
  "sweets",
  "gift box",
  "gift basket",
  "bouquet",
  "confectionery",
];

const CHOCOLATE_SIGNAL_TERMS = [
  "chocolate",
  "chocolates",
  "kitkat",
  "kit kat",
  "ferrero",
  "rocher",
  "cadbury",
  "toblerone",
  "sweets",
  "confectionery",
  "gift box",
  "gift basket",
  "bouquet",
];

const NON_CHOCOLATE_HAMPER_TERMS = [
  "fruit",
  "fruits",
  "healthy",
  "grocery",
  "food hamper",
  "energy hamper",
  "snack hamper",
];

const DAD_REQUEST_TERMS = [
  "dad",
  "father",
  "father's",
  "fathers",
  "him",
];

const DAD_PREFERRED_TERMS = [
  "dad",
  "father",
  "gentleman",
  "men",
  "him",
];

const DAD_WRONG_RECIPIENT_TERMS = [
  "for her",
  "her special day",
  "girlfriend",
  "wife",
  "queen",
  "princess",
  "mum",
  "mom",
  "mother",
];

const GIFT_LIKE_TERMS = [
  "gift box",
  "gift set",
  "hamper",
  "bouquet",
  "combo",
  "personalized",
];

const GROCERY_STAPLE_TERMS = [
  "sugar",
  "dhal",
  "parippu",
  "rice",
  "flour",
  "oil",
  "salt",
  "noodles",
  "spice",
  "lentils",
];

const GROCERY_INTENT_TERMS = [
  "grocery",
  "groceries",
  "ration",
  "staples",
  "cooking essentials",
];
