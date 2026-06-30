export type ShoppingIntent = {
  rawQuery: string;
  intentProvider?: "groq" | "gemini" | "fallback";
  intent?: "search_products" | "add_to_cart" | "remove_from_cart" | "view_cart" | "checkout" | "track_order" | "ask_clarifying_question" | "general_reply";
  query?: string | null;
  product_reference?: string | null;
  delivery_location?: string | null;
  trackingReference?: string | null;
  reply_language?: "english" | "sinhala" | "tamil" | "singlish" | "tanglish" | "mixed" | null;
  clarifying_question?: string | null;
  assistant_reply?: string | null;
  detectedLanguage: string | null;
  languageStyle: "en" | "singlish" | "tanglish" | "si" | "ta" | "mixed" | "unknown";
  translatedShoppingRequestEnglish: string | null;
  searchQueryEnglish: string | null;
  searchQuery: string | null;
  occasion: string | null;
  recipient: string | null;
  recipientNormalized: string | null;
  category: string | null;
  budgetMax: number | null;
  budgetMin: number | null;
  city: string | null;
  deliveryDate: string | null;
  deliveryDateRaw: string | null;
  urgency: "today" | "tomorrow" | "scheduled" | "unknown" | null;
  confidence: number;
  clarificationNeeded: boolean;
  clarificationQuestion: string | null;
  missingFields: string[];
  language: "en" | "singlish" | "tanglish" | "si" | "ta" | "mixed" | "unknown";
};

export const SHOPPING_INTENT_FIELDS = [
  "rawQuery",
  "intentProvider",
  "intent",
  "query",
  "product_reference",
  "delivery_location",
  "reply_language",
  "clarifying_question",
  "assistant_reply",
  "trackingReference",
  "detectedLanguage",
  "languageStyle",
  "translatedShoppingRequestEnglish",
  "searchQueryEnglish",
  "searchQuery",
  "occasion",
  "recipient",
  "recipientNormalized",
  "category",
  "budgetMax",
  "budgetMin",
  "city",
  "deliveryDateRaw",
  "deliveryDate",
  "urgency",
  "confidence",
  "clarificationNeeded",
  "clarificationQuestion",
  "missingFields",
  "language",
] as const;

export function normalizeShoppingIntent(
  rawQuery: string,
  value: unknown
): ShoppingIntent {
  const record = isRecord(value) ? value : {};
  const searchQueryEnglish = normalizeText(record.searchQueryEnglish);
  const searchQuery = normalizeText(record.searchQuery) || searchQueryEnglish;
  const category = normalizeText(record.category);
  const languageStyle = normalizeLanguageStyle(record.languageStyle || record.language);

  return {
    rawQuery,
    intentProvider: normalizeIntentProvider(record.intentProvider),
    intent: normalizeIntentType(record.intent),
    query: normalizeText(record.query),
    product_reference: normalizeText(record.product_reference),
    delivery_location: normalizeText(record.delivery_location),
    trackingReference: normalizeText(record.trackingReference || record.tracking_reference),
    reply_language: normalizeReplyLanguage(record.reply_language),
    clarifying_question: normalizeText(record.clarifying_question),
    assistant_reply: normalizeText(record.assistant_reply),
    detectedLanguage: normalizeText(record.detectedLanguage),
    languageStyle,
    translatedShoppingRequestEnglish: normalizeText(
      record.translatedShoppingRequestEnglish
    ),
    searchQueryEnglish,
    searchQuery: searchQuery || searchQueryEnglish || category,
    occasion: normalizeText(record.occasion),
    recipient: normalizeText(record.recipient),
    recipientNormalized: normalizeRecipient(
      normalizeText(record.recipientNormalized) || normalizeText(record.recipient)
    ),
    category: normalizeCategory(category),
    budgetMax: normalizeMoney(record.budgetMax),
    budgetMin: normalizeMoney(record.budgetMin),
    city: normalizeText(record.city),
    deliveryDateRaw: normalizeText(record.deliveryDateRaw),
    deliveryDate: normalizeText(record.deliveryDate),
    urgency: normalizeUrgency(record.urgency),
    confidence: normalizeConfidence(record.confidence),
    clarificationNeeded: normalizeBoolean(record.clarificationNeeded),
    clarificationQuestion: normalizeText(record.clarificationQuestion),
    missingFields: normalizeStringArray(record.missingFields),
    language: languageStyle,
  };
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.toLowerCase() !== "null" ? trimmed : null;
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
  if (
    value === "today" ||
    value === "tomorrow" ||
    value === "scheduled" ||
    value === "unknown"
  ) {
    return value;
  }

  return null;
}

function normalizeIntentType(value: unknown): ShoppingIntent["intent"] {
  const text = normalizeText(value);
  const allowed = [
    "search_products",
    "add_to_cart",
    "remove_from_cart",
    "view_cart",
    "checkout",
    "track_order",
    "ask_clarifying_question",
    "general_reply",
  ] as const;

  return text && allowed.includes(text as (typeof allowed)[number])
    ? (text as ShoppingIntent["intent"])
    : undefined;
}

function normalizeIntentProvider(value: unknown): ShoppingIntent["intentProvider"] {
  return value === "gemini" || value === "groq" || value === "fallback"
    ? value
    : undefined;
}

function normalizeReplyLanguage(
  value: unknown
): ShoppingIntent["reply_language"] {
  const text = normalizeText(value)?.toLowerCase();
  const allowed = ["english", "sinhala", "tamil", "singlish", "tanglish", "mixed"];

  return text && allowed.includes(text) ? (text as ShoppingIntent["reply_language"]) : null;
}

function normalizeLanguageStyle(value: unknown): ShoppingIntent["languageStyle"] {
  const text = normalizeText(value)?.toLowerCase();

  if (
    text === "singlish" ||
    text === "tanglish" ||
    text === "si" ||
    text === "ta" ||
    text === "mixed" ||
    text === "unknown" ||
    text === "en"
  ) {
    return text;
  }

  if (text === "sinhala") {
    return "si";
  }

  if (text === "tamil") {
    return "ta";
  }

  return "en";
}

function normalizeCategory(value: string | null) {
  const text = value?.toLowerCase() || "";

  if (!text) {
    return null;
  }

  if (text.includes("cake")) {
    return "cakes";
  }

  if (text.includes("flower") || text.includes("bouquet") || text.includes("rose")) {
    return "flowers";
  }

  if (text.includes("chocolate")) {
    return "chocolates";
  }

  if (text.includes("hamper")) {
    return "hampers";
  }

  if (text.includes("gift")) {
    return "gifts";
  }

  if (text.includes("plant")) {
    return "plants";
  }

  if (text.includes("fruit")) {
    return "fruit";
  }

  if (text === "other") {
    return "other";
  }

  return "other";
}

function normalizeRecipient(value: string | null) {
  const text = value?.toLowerCase() || "";

  if (!text) {
    return null;
  }

  if (["mum", "mother", "mom", "amma", "ammi"].some((term) => text.includes(term))) {
    return "mum";
  }

  if (
    ["dad", "father", "appa", "thaththa", "thatta", "thaaththa", "thaatha"].some(
      (term) => text.includes(term)
    )
  ) {
    return "dad";
  }

  if (["grandmother", "grandma", "aachchi", "achchi"].some((term) => text.includes(term))) {
    return "grandmother";
  }

  if (["grandfather", "grandpa", "seeya"].some((term) => text.includes(term))) {
    return "grandfather";
  }

  return value;
}

function normalizeConfidence(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.5;
  }

  return 0.5;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeText)
    .filter((item): item is string => Boolean(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
