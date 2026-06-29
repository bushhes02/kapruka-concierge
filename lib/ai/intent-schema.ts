export type ShoppingIntent = {
  rawQuery: string;
  searchQuery: string | null;
  occasion: string | null;
  recipient: string | null;
  category: string | null;
  budgetMax: number | null;
  budgetMin: number | null;
  city: string | null;
  deliveryDate: string | null;
  urgency: "normal" | "urgent" | "scheduled" | null;
  language: string | null;
};

export const SHOPPING_INTENT_FIELDS = [
  "rawQuery",
  "searchQuery",
  "occasion",
  "recipient",
  "category",
  "budgetMax",
  "budgetMin",
  "city",
  "deliveryDate",
  "urgency",
  "language",
] as const;

export function normalizeShoppingIntent(
  rawQuery: string,
  value: unknown
): ShoppingIntent {
  const record = isRecord(value) ? value : {};
  const searchQuery = normalizeText(record.searchQuery);
  const category = normalizeText(record.category);

  return {
    rawQuery,
    searchQuery: searchQuery || category || rawQuery,
    occasion: normalizeText(record.occasion),
    recipient: normalizeText(record.recipient),
    category,
    budgetMax: normalizeMoney(record.budgetMax),
    budgetMin: normalizeMoney(record.budgetMin),
    city: normalizeText(record.city),
    deliveryDate: normalizeText(record.deliveryDate),
    urgency: normalizeUrgency(record.urgency),
    language: normalizeText(record.language) || "en",
  };
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function normalizeUrgency(value: unknown): ShoppingIntent["urgency"] {
  if (value === "normal" || value === "urgent" || value === "scheduled") {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
