import "server-only";

import { extractShoppingIntent as extractShoppingIntentWithGroq } from "@/lib/ai/groq-client";

export type AgentIntentType =
  | "search_products"
  | "add_to_cart"
  | "remove_from_cart"
  | "view_cart"
  | "checkout"
  | "track_order"
  | "ask_clarifying_question"
  | "general_reply";

export type ReplyLanguage =
  | "english"
  | "sinhala"
  | "tamil"
  | "singlish"
  | "tanglish"
  | "mixed";

export type ParsedAgentIntent = {
  intent: AgentIntentType;
  query: string | null;
  product_reference: string | null;
  trackingReference: string | null;
  delivery_location: string | null;
  reply_language: ReplyLanguage;
  clarifying_question: string | null;
  assistant_reply: string | null;
  rawQuery: string;
  detectedLanguage: string | null;
  languageStyle: "en" | "singlish" | "tanglish" | "si" | "ta" | "mixed" | "unknown";
  translatedShoppingRequestEnglish: string | null;
  searchQueryEnglish: string | null;
  category: "cakes" | "flowers" | "chocolates" | "hampers" | "gifts" | "plants" | "fruit" | "other" | null;
  occasion: string | null;
  recipient: string | null;
  recipientNormalized: string | null;
  budgetMax: number | null;
  budgetMin: number | null;
  city: string | null;
  deliveryDateRaw: string | null;
  urgency: "today" | "tomorrow" | "scheduled" | "unknown" | null;
  clarificationNeeded: boolean;
  confidence: number;
  intentProvider: "gemini" | "groq" | "fallback";
};

const GEMINI_MODELS = uniqueModels([
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
]);

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export async function parseShoppingIntent(
  rawUserQuery: string,
  inputContext?: {
    currentCart?: Array<{ id: string; name: string; price: number | null }>;
    selectedProduct?: { id: string; name: string } | null;
  }
): Promise<ParsedAgentIntent> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for Gemini intent parsing.");
  }

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: [
                    "You are a multilingual shopping intent translator for Sri Lankan ecommerce.",
                    "Understand English, Sinhala, Tamil, Singlish, Tanglish, romanized Sinhala, romanized Tamil, spelling mistakes, mixed scripts, and informal chat language.",
                    "Translate the user's shopping meaning into English shopping intent and return strict JSON only.",
                    "Do not recommend products.",
                    "Do not choose products.",
                    "Do not rank products.",
                    "Do not invent missing city, date, budget, product ids, availability, or stock.",
                    "Do not decide delivery validity.",
                    "Do not create orders.",
                    "Do not include markdown, code fences, or commentary.",
                    "If the request is clear, search for products; if unclear, ask a concise clarifying question.",
                    "Use the whole sentence and language style to infer kinship and shopping meaning.",
                    "The response must be valid JSON with these fields only:",
                    '{"intent":"search_products|add_to_cart|remove_from_cart|view_cart|checkout|track_order|ask_clarifying_question|general_reply","query":string|null,"product_reference":string|null,"trackingReference":string|null,"delivery_location":string|null,"reply_language":"english|sinhala|tamil|singlish|tanglish|mixed","clarifying_question":string|null,"assistant_reply":string|null,"rawQuery":string,"detectedLanguage":string,"languageStyle":"en|singlish|tanglish|si|ta|mixed|unknown","translatedShoppingRequestEnglish":string,"searchQueryEnglish":string,"category":"cakes|flowers|chocolates|hampers|gifts|plants|fruit|other|null","occasion":string|null,"recipient":string|null,"recipientNormalized":string|null,"budgetMax":number|null,"budgetMin":number|null,"city":string|null,"deliveryDateRaw":string|null,"urgency":"today|tomorrow|scheduled|unknown|null","clarificationNeeded":boolean,"confidence":number}',
                    "Translate the shopping meaning, not word for word.",
                    "If the user is asking to buy or browse, intent should usually be search_products.",
                    "If the user asks to add something to cart without a clear selected product_reference, set intent to ask_clarifying_question.",
                "If the user asks to view the cart, set intent to view_cart.",
                "If the user asks to checkout, set intent to checkout.",
                "If the user asks to track an order, set intent to track_order and extract the order reference if mentioned.",
                "If the user asks for a vague gift, create a useful simple English searchQueryEnglish such as birthday gift for mother or gift for father.",
                    "searchQueryEnglish must be short and product-focused for Kapruka search.",
                    "Use current cart and selected product context only if needed to disambiguate add/remove/view/checkout requests.",
                    "Do not invent city/date/budget if not present.",
                    "If the user mentions a place, set delivery_location or city only when it is actually in the message.",
                    "If the user uses relative time like tomorrow, today, or friday, preserve it in deliveryDateRaw.",
                    "For kinship meanings, use the whole sentence and language style to disambiguate.",
                    "In Sinhala or Singlish context, thaatha/thaththa/thaaththa/thaatha-style terms mean father.",
                    "In Tamil or Tanglish context, thaatha can mean grandfather, while appa means father.",
                    "reply_language should match the user's language or mixed style.",
                    "assistant_reply should be a short natural reply in the same language style.",
                    "clarifying_question should be short and only used when clarification is needed.",
                  ].join(" "),
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify({
                      rawUserQuery,
                      currentCart: inputContext?.currentCart || [],
                      selectedProduct: inputContext?.selectedProduct || null,
                    }),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 420,
              responseMimeType: "application/json",
            },
          }),
          cache: "no-store",
        }
      );

      const text = await response.text();

      if (!response.ok) {
        const message = `Gemini intent parsing failed for ${model}: HTTP ${response.status}: ${text}`;

        if (isModelNotFoundError(response.status, text)) {
          continue;
        }

        throw new Error(message);
      }

      const data = JSON.parse(text) as GeminiGenerateContentResponse;
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error("Gemini intent parsing returned no content.");
      }

      const parsed = safeParseJson(content);
      return validateParsedAgentIntent(rawUserQuery, parsed, inputContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV === "development") {
        console.info("Gemini intent parse fallback", {
          model,
          error: message,
        });
      }

      continue;
    }
  }

  try {
    const groqIntent = await extractShoppingIntentWithGroq(rawUserQuery);
    return {
      ...validateParsedAgentIntent(
        rawUserQuery,
        {
          ...groqIntent,
          intent: groqIntent.intent || "search_products",
        },
        inputContext
      ),
      intentProvider: "groq",
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.info("Kavi intent fallback after Gemini/Groq failure", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return buildFallbackIntent(rawUserQuery);
  }
}

export function validateParsedAgentIntent(
  rawUserQuery: string,
  value: unknown,
  inputContext?: {
    currentCart?: Array<{ id: string; name: string; price: number | null }>;
    selectedProduct?: { id: string; name: string } | null;
  }
): ParsedAgentIntent {
  if (!isRecord(value)) {
    throw new Error("Gemini intent parsing returned malformed JSON.");
  }

  const intent = normalizeIntentLiteral(value.intent);
  const replyLanguage = normalizeReplyLanguage(value.reply_language);
  const languageStyle = normalizeLanguageStyle(value.languageStyle, rawUserQuery);
  const category = normalizeCategory(value.category);
  const productReference = cleanString(value.product_reference);
  const currentCart = inputContext?.currentCart || [];

  return {
    intent,
    query: cleanString(value.query),
    product_reference: productReference,
    trackingReference: cleanString(value.trackingReference) || cleanString(value.tracking_reference),
    delivery_location: cleanString(value.delivery_location),
    reply_language: replyLanguage,
    clarifying_question: cleanString(value.clarifying_question),
    assistant_reply: cleanString(value.assistant_reply),
    rawQuery: rawUserQuery,
    detectedLanguage: cleanString(value.detectedLanguage),
    languageStyle,
    translatedShoppingRequestEnglish:
      cleanString(value.translatedShoppingRequestEnglish) || rawUserQuery,
    searchQueryEnglish:
      cleanString(value.searchQueryEnglish) ||
      cleanString(value.query) ||
      null,
    category,
    occasion: cleanString(value.occasion),
    recipient: cleanString(value.recipient),
    recipientNormalized: normalizeRecipient(
      cleanString(value.recipientNormalized) || cleanString(value.recipient),
      rawUserQuery,
      languageStyle
    ),
    budgetMax: normalizeMoney(value.budgetMax),
    budgetMin: normalizeMoney(value.budgetMin),
    city: cleanString(value.city) || cleanString(value.delivery_location),
    deliveryDateRaw: cleanString(value.deliveryDateRaw),
    urgency: normalizeUrgency(value.urgency),
    clarificationNeeded: normalizeBoolean(value.clarificationNeeded),
    confidence: normalizeConfidence(value.confidence),
    intentProvider: "gemini",
  };
}

function safeParseJson(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("Gemini intent parsing returned non-JSON content.");
    }

    return JSON.parse(match[0]);
  }
}

function normalizeIntentLiteral(value: unknown): ParsedAgentIntent["intent"] {
  const text = typeof value === "string" ? value.trim() : "";
  const allowed: ParsedAgentIntent["intent"][] = [
    "search_products",
    "add_to_cart",
    "remove_from_cart",
    "view_cart",
    "checkout",
    "track_order",
    "ask_clarifying_question",
    "general_reply",
  ];

  return allowed.includes(text as ParsedAgentIntent["intent"])
    ? (text as ParsedAgentIntent["intent"])
    : "search_products";
}

function normalizeReplyLanguage(value: unknown): ParsedAgentIntent["reply_language"] {
  const text = cleanString(value)?.toLowerCase();
  const allowed: ParsedAgentIntent["reply_language"][] = [
    "english",
    "sinhala",
    "tamil",
    "singlish",
    "tanglish",
    "mixed",
  ];

  return allowed.includes(text as ParsedAgentIntent["reply_language"])
    ? (text as ParsedAgentIntent["reply_language"])
    : "mixed";
}

function normalizeLanguageStyle(
  value: unknown,
  rawUserQuery: string
): ParsedAgentIntent["languageStyle"] {
  const text = cleanString(value)?.toLowerCase();

  if (
    text === "en" ||
    text === "singlish" ||
    text === "tanglish" ||
    text === "si" ||
    text === "ta" ||
    text === "mixed" ||
    text === "unknown"
  ) {
    return text;
  }

  if (/[\u0d80-\u0dff]/.test(rawUserQuery)) {
    return "si";
  }

  if (/[\u0b80-\u0bff]/.test(rawUserQuery)) {
    return "ta";
  }

  return "unknown";
}

function normalizeCategory(value: unknown) {
  const text = cleanString(value)?.toLowerCase();

  if (
    text === "cakes" ||
    text === "flowers" ||
    text === "chocolates" ||
    text === "hampers" ||
    text === "gifts" ||
    text === "plants" ||
    text === "fruit" ||
    text === "other" ||
    text === null
  ) {
    return text;
  }

  return "other";
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

function normalizeUrgency(value: unknown): ParsedAgentIntent["urgency"] {
  const text = cleanString(value)?.toLowerCase();
  if (text === "today" || text === "tomorrow" || text === "scheduled" || text === "unknown") {
    return text;
  }

  return null;
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

function cleanString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === "null" || lowered === "undefined" ? null : trimmed;
}

function normalizeRecipient(
  value: string | null,
  rawUserQuery: string,
  languageStyle: ParsedAgentIntent["languageStyle"]
) {
  if (value) {
    return value;
  }

  const raw = rawUserQuery.toLowerCase();

  if (languageStyle === "si" || languageStyle === "singlish") {
    if (/\b(amma|ammi|අම්මා|அம்மா)\b/.test(rawUserQuery) || raw.includes("amma") || raw.includes("ammi")) {
      return "mum";
    }

    if (
      /\b(appa|thaththa|thatta|thaaththa|thaatha|තාත්තා|அப்பா)\b/.test(rawUserQuery) ||
      raw.includes("appa") ||
      raw.includes("thaththa") ||
      raw.includes("thaatha")
    ) {
      return "dad";
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildFallbackIntent(rawUserQuery: string): ParsedAgentIntent {
  return {
    intent: "ask_clarifying_question",
    query: null,
    product_reference: null,
    trackingReference: null,
    delivery_location: null,
    reply_language: "english",
    clarifying_question: "Could you tell me what you want to find?",
    assistant_reply: "Could you tell me what you want to find?",
    rawQuery: rawUserQuery,
    detectedLanguage: null,
    languageStyle: "unknown",
    translatedShoppingRequestEnglish: rawUserQuery,
    searchQueryEnglish: null,
    category: null,
    occasion: null,
    recipient: null,
    recipientNormalized: null,
    budgetMax: null,
    budgetMin: null,
    city: null,
    deliveryDateRaw: null,
    urgency: null,
    clarificationNeeded: true,
    confidence: 0,
    intentProvider: "fallback",
  };
}

function uniqueModels(models: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      models
        .map((model) => (typeof model === "string" ? model.trim() : ""))
        .filter(Boolean)
    )
  );
}

function isModelNotFoundError(status: number, text: string) {
  return (
    status === 404 &&
    text.toLowerCase().includes("not found") &&
    text.toLowerCase().includes("generatecontent")
  );
}
