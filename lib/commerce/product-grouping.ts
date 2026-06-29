import type { KaprukaProduct } from "@/lib/kapruka/product-normalizer";

export type ProductGroup = {
  label: "Best Match" | "Best Value" | "Premium Pick";
  reason: string;
  product: KaprukaProduct | null;
};

export function groupProducts(
  products: KaprukaProduct[],
  query: string
): ProductGroup[] {
  const uniqueProducts = dedupeProducts(products);
  const productsWithPrices = uniqueProducts.filter(
    (product) => typeof product.price === "number"
  );

  const bestMatch = getBestMatch(uniqueProducts, query);
  const bestValue = getBestValue(productsWithPrices, bestMatch?.id || null);
  const premiumPick = getPremiumPick(
    productsWithPrices,
    new Set([bestMatch?.id, bestValue?.id].filter(Boolean) as string[])
  );

  return [
    {
      label: "Best Match",
      reason: "Chosen by keyword overlap with your search.",
      product: bestMatch,
    },
    {
      label: "Best Value",
      reason: "Lowest priced relevant product with a listed price.",
      product: bestValue,
    },
    {
      label: "Premium Pick",
      reason: "Highest priced relevant product with a listed price.",
      product: premiumPick,
    },
  ];
}

function getBestMatch(products: KaprukaProduct[], query: string) {
  const queryWords = tokenize(query);

  return [...products].sort((a, b) => {
    const scoreDifference =
      scoreProductName(b.name, queryWords) - scoreProductName(a.name, queryWords);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (a.price ?? Number.MAX_SAFE_INTEGER) -
      (b.price ?? Number.MAX_SAFE_INTEGER);
  })[0] || null;
}

function getBestValue(products: KaprukaProduct[], excludeId: string | null) {
  return [...products]
    .filter((product) => product.id !== excludeId)
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] || null;
}

function getPremiumPick(products: KaprukaProduct[], excludeIds: Set<string>) {
  return [...products]
    .filter((product) => !excludeIds.has(product.id))
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0] || null;
}

function dedupeProducts(products: KaprukaProduct[]) {
  const seen = new Set<string>();

  return products.filter((product) => {
    const key = product.id || product.name;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function scoreProductName(name: string, queryWords: string[]) {
  const nameWords = tokenize(name);
  return queryWords.reduce(
    (score, word) => score + (nameWords.includes(word) ? 1 : 0),
    0
  );
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
