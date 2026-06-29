export type KaprukaProduct = {
  id: string;
  name: string;
  price: number | null;
  priceText: string;
  imageUrl: string | null;
  stockStatus: string | null;
  url: string | null;
  raw: unknown;
};

export function normalizeKaprukaProducts(result: unknown): KaprukaProduct[] {
  const rawProducts = extractProductArray(result);

  return rawProducts.map((product, index) => normalizeProduct(product, index));
}

function extractProductArray(result: unknown): unknown[] {
  const parsed = parseToolResult(result);
  const directProducts = findProductArray(parsed);

  if (directProducts) {
    return directProducts;
  }

  return extractMarkdownProducts(parsed);
}

function extractMarkdownProducts(value: unknown): unknown[] {
  const markdown = isRecord(value) && typeof value.result === "string" ? value.result : value;

  if (typeof markdown !== "string") {
    return [];
  }

  const products: Array<Record<string, unknown>> = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = lines[i].match(/^\*\*\d+\.\s+(.+?)\*\*/);

    if (!titleMatch) {
      continue;
    }

    const name = titleMatch[1]?.trim();
    const detailLine = lines[i + 1] ?? "";
    const linkLine = lines[i + 2] ?? "";
    const idMatch = detailLine.match(/ID:\s+`([^`]+)`/);
    const priceMatch = detailLine.match(/LKR\s+([\d,]+)/);
    const stockMatch = detailLine.match(/LKR\s+[\d,]+\s+·\s+(.+)$/);
    const urlMatch = linkLine.match(/\[View product\]\(([^)]+)\)/);

    if (!name || !idMatch) {
      continue;
    }

    const priceDigits = priceMatch?.[1] ?? "";
    const price = priceDigits ? Number(priceDigits.replace(/,/g, "")) : null;

    products.push({
      id: idMatch[1],
      name,
      price: price !== null && Number.isFinite(price) ? price : null,
      priceText: priceDigits ? `Rs. ${priceDigits}` : "Price unavailable",
      stockStatus: stockMatch?.[1]?.trim() ?? null,
      url: urlMatch?.[1] ?? null,
    });
  }

  return products;
}

function findProductArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 6) {
    return null;
  }

  if (Array.isArray(value)) {
    if (value.some(looksLikeProduct)) {
      return value;
    }

    for (const item of value) {
      const nested = findProductArray(item, depth + 1);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const possibleKeys = [
    "products",
    "items",
    "results",
    "data",
    "productStubs",
    "stubs",
    "product_stubs",
    "searchResults",
    "search_results",
    "matches",
  ];

  for (const key of possibleKeys) {
    const nested = findProductArray(value[key], depth + 1);

    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nested = findProductArray(nestedValue, depth + 1);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function looksLikeProduct(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Boolean(
    pickString(value, ["id", "sku", "productId", "product_id", "code", "product_code"]) ||
      pickString(value, ["name", "title", "productName", "product_name", "product_title"])
  );
}

function parseToolResult(result: unknown): unknown {
  if (isRecord(result) && Array.isArray(result.content)) {
    const textContent = result.content.find(
      (item) => isRecord(item) && item.type === "text" && typeof item.text === "string"
    );

    if (isRecord(textContent) && typeof textContent.text === "string") {
      try {
        return JSON.parse(textContent.text);
      } catch {
        return textContent.text;
      }
    }
  }

  return result;
}

function normalizeProduct(product: unknown, index: number): KaprukaProduct {
  const record = isRecord(product) ? product : {};
  const name = pickString(record, ["name", "title", "productName", "product_name", "product_title"]);
  const priceValue = pickValue(record, [
    "price",
    "amount",
    "salePrice",
    "sale_price",
    "sellingPrice",
    "selling_price",
    "display_price",
    "price_lkr",
    "lkr_price",
  ]);
  const price = parsePrice(priceValue);
  const priceText =
    pickString(record, ["priceText", "price_text", "displayPrice", "display_price"]) ||
    (price === null ? "Price unavailable" : `Rs. ${price.toLocaleString("en-LK")}`);

  return {
    id:
      pickString(record, ["id", "sku", "productId", "product_id", "code", "product_code"]) ||
      `kapruka-product-${index}`,
    name: name || "Unnamed Kapruka product",
    price,
    priceText,
    imageUrl: pickImageUrl(record),
    stockStatus: pickString(record, ["stock", "stockStatus", "stock_status", "availability"]),
    url: pickString(record, ["url", "productUrl", "product_url", "link"]),
    raw: product,
  };
}

function pickImageUrl(record: Record<string, unknown>) {
  const directImage = pickString(record, [
    "image",
    "imageUrl",
    "image_url",
    "thumbnail",
    "thumbnailUrl",
    "thumbnail_url",
    "primaryImage",
    "primary_image",
  ]);

  if (directImage) {
    return directImage;
  }

  const images = record.images;

  if (Array.isArray(images)) {
    for (const image of images) {
      if (typeof image === "string" && image.trim()) {
        return image.trim();
      }

      if (isRecord(image)) {
        const nestedImage = pickString(image, ["url", "src", "imageUrl", "image_url"]);

        if (nestedImage) {
          return nestedImage;
        }
      }
    }
  }

  return null;
}

function pickValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  const value = pickValue(record, keys);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^0-9.]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}