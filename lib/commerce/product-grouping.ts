import type { KaprukaProduct } from "@/lib/kapruka/product-normalizer";

export type ProductGroup = {
  label: "Best Match" | "Best Value" | "Premium Pick";
  reason: string;
  product: KaprukaProduct | null;
};

export type ProductGroupingContext = {
  recipient?: string | null;
  requestText?: string;
};

export function groupProducts(
  products: KaprukaProduct[],
  query: string,
  context: ProductGroupingContext = {}
): ProductGroup[] {
  const uniqueProducts = dedupeProducts(products);
  const productsWithPrices = uniqueProducts.filter(
    (product) => typeof product.price === "number"
  );

  const bestMatch = getBestMatch(uniqueProducts, query, context);
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

function getBestMatch(
  products: KaprukaProduct[],
  query: string,
  context: ProductGroupingContext
) {
  const queryWords = tokenize(query);

  return [...products].sort((a, b) => {
    const scoreDifference =
      scoreBestMatch(b, queryWords, context) -
      scoreBestMatch(a, queryWords, context);

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

function scoreBestMatch(
  product: KaprukaProduct,
  queryWords: string[],
  context: ProductGroupingContext
) {
  const name = product.name.toLowerCase();
  const nameWords = tokenize(product.name);
  const keywordScore = queryWords.reduce(
    (score, word) => score + (nameWords.includes(word) ? 1 : 0),
    0
  );
  const isDadChocolateGiftRequest =
    isDadRecipient(context) && isChocolateGiftRequest(context.requestText || "");

  if (!isDadChocolateGiftRequest) {
    return keywordScore;
  }

  const recipientScore = scoreTerms(name, DAD_PREFERRED_TERMS) * 20;
  const giftScore = scoreTerms(name, GIFT_LIKE_TERMS) * 10;
  const chocolateScore = scoreTerms(name, CHOCOLATE_TERMS) * 3;
  const plainChocolatePenalty =
    chocolateScore > 0 && recipientScore === 0 && giftScore === 0 ? 15 : 0;

  return keywordScore + recipientScore + giftScore + chocolateScore - plainChocolatePenalty;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isDadRecipient(context: ProductGroupingContext) {
  const recipient = (context.recipient || "").toLowerCase();
  const requestText = (context.requestText || "").toLowerCase();

  return DAD_PREFERRED_TERMS.some(
    (term) => recipient.includes(term) || requestText.includes(term)
  );
}

function isChocolateGiftRequest(requestText: string) {
  const normalized = requestText.toLowerCase();
  return (
    CHOCOLATE_TERMS.some((term) => normalized.includes(term)) &&
    ["hamper", "gift", "box", "bouquet"].some((term) => normalized.includes(term))
  );
}

function scoreTerms(value: string, terms: string[]) {
  return terms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0);
}

const DAD_PREFERRED_TERMS = ["dad", "father", "gentleman", "men", "him"];

const GIFT_LIKE_TERMS = [
  "gift box",
  "gift set",
  "hamper",
  "bouquet",
  "combo",
  "personalized",
];

const CHOCOLATE_TERMS = [
  "chocolate",
  "chocolates",
  "kitkat",
  "cadbury",
  "ferrero",
  "rocher",
  "toblerone",
];
