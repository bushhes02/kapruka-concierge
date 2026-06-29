import "server-only";

import { groupProducts } from "@/lib/commerce/product-grouping";
import { extractShoppingIntent } from "@/lib/ai/groq-client";
import { generateKaviAssistantMessage } from "@/lib/ai/gemini-client";
import type { ShoppingIntent } from "@/lib/ai/intent-schema";
import { searchKaprukaProducts } from "@/lib/kapruka/mcp-client";
import type { KaprukaProduct } from "@/lib/kapruka/product-normalizer";

export type ShoppingOrchestratorResult = {
  intent: ShoppingIntent;
  assistantMessage: string;
  products: KaprukaProduct[];
  groups: ReturnType<typeof groupProducts>;
};

export async function runShoppingOrchestrator(
  rawQuery: string
): Promise<ShoppingOrchestratorResult> {
  const intent = await extractShoppingIntent(rawQuery);
  const kaprukaQuery = buildKaprukaQuery(intent);
  const searchedProducts = await searchKaprukaProducts(kaprukaQuery);
  const relevantProducts = await getRelevantProducts(
    searchedProducts,
    intent,
    kaprukaQuery
  );
  const products = filterProductsByBudget(relevantProducts, intent);
  const groups = groupProducts(products, kaprukaQuery);
  const assistantMessage = await generateKaviAssistantMessage({
    intent,
    groups,
  });

  return {
    intent,
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
  if (!isCakeIntent(intent) || isCakeAccessoryIntent(intent)) {
    return products;
  }

  let mergedProducts = products;
  let relevantProducts = filterCakeProducts(mergedProducts);

  for (const fallbackQuery of buildCakeFallbackQueries(intent, originalQuery)) {
    if (relevantProducts.length >= 3) {
      break;
    }

    const fallbackProducts = await searchKaprukaProducts(fallbackQuery);
    mergedProducts = mergeProducts(mergedProducts, fallbackProducts);
    relevantProducts = filterCakeProducts(mergedProducts);
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

function isCakeIntent(intent: ShoppingIntent) {
  const category = normalize(intent.category);
  const requestText = normalize(
    [intent.rawQuery, intent.searchQuery, intent.category].filter(Boolean).join(" ")
  );

  return (
    category === "cake" ||
    category === "cakes" ||
    category.includes(" cakes") ||
    requestText.includes("cake")
  );
}

function isCakeAccessoryIntent(intent: ShoppingIntent) {
  const requestText = normalize(
    [intent.rawQuery, intent.searchQuery, intent.category].filter(Boolean).join(" ")
  );

  return CAKE_ACCESSORY_REQUEST_TERMS.some((term) => requestText.includes(term));
}

function isRelevantCakeProduct(product: KaprukaProduct) {
  const name = normalize(product.name);

  if (CAKE_EXCLUDED_PRODUCT_TERMS.some((term) => name.includes(term))) {
    return false;
  }

  return isCakeId(product) || EDIBLE_CAKE_TERMS.some((term) => name.includes(term));
}

function isCakeId(product: KaprukaProduct) {
  return product.id.toUpperCase().startsWith("CAKE");
}

function isPartnerCategoryId(product: KaprukaProduct) {
  return product.id.toUpperCase().startsWith("PC");
}

function filterCakeProducts(
  products: KaprukaProduct[]
) {
  const relevantProducts = products.filter(isRelevantCakeProduct);
  const preferredProducts = relevantProducts.filter(
    (product) => !isPartnerCategoryId(product)
  );

  return preferredProducts.sort((a, b) => {
    const cakeIdDifference = Number(isCakeId(b)) - Number(isCakeId(a));

    if (cakeIdDifference !== 0) {
      return cakeIdDifference;
    }

    return (a.price ?? Number.MAX_SAFE_INTEGER) -
      (b.price ?? Number.MAX_SAFE_INTEGER);
  });
}

function buildCakeFallbackQueries(intent: ShoppingIntent, originalQuery: string) {
  const requestText = normalize(
    [intent.rawQuery, intent.searchQuery, intent.category].filter(Boolean).join(" ")
  );
  const fallbackQueries = requestText.includes("birthday")
    ? ["birthday cake", "cake"]
    : ["cake", "birthday cake"];
  const normalizedOriginalQuery = normalize(originalQuery);

  return fallbackQueries.filter(
    (query, index) =>
      fallbackQueries.indexOf(query) === index &&
      normalize(query) !== normalizedOriginalQuery
  );
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
