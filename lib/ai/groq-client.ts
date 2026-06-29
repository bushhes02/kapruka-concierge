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
            "You extract shopping intent for Kapruka Sri Lanka.",
            "Return only a JSON object with these fields:",
            SHOPPING_INTENT_FIELDS.join(", "),
            "Use null when a field is unknown.",
            "budgetMax and budgetMin must be numbers in LKR when present.",
            "deliveryDate should be ISO YYYY-MM-DD when a clear date is present, otherwise null.",
            "urgency must be one of normal, urgent, scheduled, or null.",
            "searchQuery should be the concise product search phrase for Kapruka.",
            "Do not choose products and do not rank products.",
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

  return normalizeShoppingIntent(rawQuery, parseJsonObject(content));
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
