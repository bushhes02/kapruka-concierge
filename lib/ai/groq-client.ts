import "server-only";

import {
  SHOPPING_INTENT_FIELDS,
  normalizeShoppingIntent,
  type ShoppingIntent,
} from "@/lib/ai/intent-schema";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export async function extractShoppingIntent(rawQuery: string): Promise<ShoppingIntent> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required for intent extraction.");
  }

  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a multilingual shopping intent translator/extractor for Kapruka Sri Lanka.",
            "You understand English, Singlish, Tanglish, Sinhala Unicode, Tamil Unicode, Sinhala/Tamil transliterated in English letters, and mixed-language messages.",
            "Translate the shopping meaning to English, not word-for-word.",
            "You may translate and extract intent only. Do not choose products, rank products, decide cart, validate delivery, checkout, or create orders.",
            "Return only a JSON object with these fields:",
            SHOPPING_INTENT_FIELDS.join(", "),
            "Use null when a field is unknown.",
            "detectedLanguage is a short natural label such as English, Singlish, Tanglish, Sinhala, Tamil, or Mixed.",
            "languageStyle must be one of en, singlish, tanglish, si, ta, mixed, unknown.",
            "translatedShoppingRequestEnglish should be a concise English sentence preserving shopping meaning.",
            "searchQueryEnglish must be concise and product-focused for Kapruka search, such as birthday cake, chocolate hamper, flower bouquet, anniversary flowers, gift hamper.",
            "Do not pass the full mixed-language sentence as searchQueryEnglish if a product phrase can be extracted.",
            "budgetMax and budgetMin must be numbers in LKR when present.",
            "deliveryDateRaw should preserve the user's date phrase, such as heta, நாளைக்கு, tomorrow, friday.",
            "deliveryDate should be ISO YYYY-MM-DD when a clear date is present, otherwise null.",
            "urgency must be one of today, tomorrow, scheduled, unknown, or null.",
            "confidence must be a number from 0 to 1.",
            "clarificationNeeded should be true only when product category or shopping need is too unclear to search safely.",
            "missingFields should list only shopping intent fields needed to proceed, not checkout PII.",
            "language should duplicate languageStyle for backward compatibility.",
            "Infer kinship, budget, product type, order tracking references, and delivery wording semantically from the whole request rather than from fixed examples.",
          ].join(" "),
        },
        {
          role: "user",
          content: rawQuery,
        },
      ],
    }),
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Groq intent extraction failed: HTTP ${response.status}: ${text}`);
  }

  const data = JSON.parse(text) as GroqChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Groq intent extraction returned no content.");
  }

  return {
    ...normalizeShoppingIntent(rawQuery, parseJsonObject(content)),
    intentProvider: "groq",
  };
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      return {};
    }

    return JSON.parse(match[0]);
  }
}
