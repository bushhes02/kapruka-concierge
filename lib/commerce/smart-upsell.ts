import "server-only";

import { searchKaprukaProducts } from "@/lib/kapruka/mcp-client";
import type { KaprukaProduct } from "@/lib/kapruka/product-normalizer";

export type SmartUpsellResult = {
  category: "cakes" | "flowers" | "chocolates" | "hampers" | "gifts" | "plants" | "fruit" | "other";
  queries: string[];
  products: KaprukaProduct[];
};

export async function buildSmartUpsell(input: {
  cartItems: Array<{ id: string; name: string; price?: number | null; displayName?: string | null }>;
}): Promise<SmartUpsellResult> {
  const category = detectCartCategory(input.cartItems);
  const queries = getUpsellQueries(category);
  const allProducts = await Promise.all(queries.map((query) => searchKaprukaProducts(query)));
  const merged = dedupeProducts(
    allProducts.flat().filter((product) => !input.cartItems.some((item) => item.id === product.id))
  );
  const products = merged.sort((a, b) => scoreUpsellProduct(b, category) - scoreUpsellProduct(a, category)).slice(0, 12);

  return {
    category,
    queries,
    products,
  };
}

function detectCartCategory(items: Array<{ name: string; displayName?: string | null }>) {
  const text = items
    .map((item) => `${item.name} ${item.displayName || ""}`.toLowerCase())
    .join(" ");

  if (text.includes("cake")) {
    return "cakes";
  }

  if (text.includes("flower") || text.includes("rose") || text.includes("bouquet")) {
    return "flowers";
  }

  if (text.includes("chocolate") || text.includes("hamper") || text.includes("gift box")) {
    return "chocolates";
  }

  if (text.includes("plant")) {
    return "plants";
  }

  if (text.includes("fruit")) {
    return "fruit";
  }

  if (text.includes("gift")) {
    return "gifts";
  }

  return "other";
}

function getUpsellQueries(category: SmartUpsellResult["category"]) {
  switch (category) {
    case "cakes":
      return ["cake candles", "greeting card", "flowers", "chocolates"];
    case "flowers":
      return ["chocolates", "greeting card"];
    case "chocolates":
      return ["flowers", "greeting card"];
    case "hampers":
    case "gifts":
      return ["greeting card", "chocolates", "flowers"];
    case "plants":
      return ["greeting card", "flowers"];
    case "fruit":
      return ["greeting card", "flowers"];
    default:
      return ["greeting card", "chocolates", "flowers"];
  }
}

function scoreUpsellProduct(product: KaprukaProduct, category: SmartUpsellResult["category"]) {
  const text = `${product.id} ${product.name} ${product.displayName || ""}`.toLowerCase();
  const categoryTerms: Record<SmartUpsellResult["category"], string[]> = {
    cakes: ["cake", "candles", "card", "flower", "chocolate"],
    flowers: ["flower", "rose", "bouquet", "card", "chocolate"],
    chocolates: ["chocolate", "gift", "card", "flower"],
    hampers: ["hamper", "gift", "card", "flower", "chocolate"],
    gifts: ["gift", "card", "chocolate", "flower"],
    plants: ["plant", "card", "flower"],
    fruit: ["fruit", "card", "flower"],
    other: ["gift", "card", "flower", "chocolate"],
  };

  const terms = categoryTerms[category];
  const termScore = terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
  const priceScore = typeof product.price === "number" ? 1 / Math.max(product.price, 1) : 0;
  return termScore * 10 + priceScore;
}

function dedupeProducts(products: KaprukaProduct[]) {
  const seen = new Set<string>();

  return products.filter((product) => {
    const key = product.id || product.url || product.name;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
