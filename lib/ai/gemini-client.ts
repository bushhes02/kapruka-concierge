import "server-only";

import type { ProductGroup } from "@/lib/commerce/product-grouping";
import type { ShoppingIntent } from "@/lib/ai/intent-schema";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export async function generateKaviAssistantMessage({
  intent,
  groups,
}: {
  intent: ShoppingIntent;
  groups: ProductGroup[];
}) {
  const fallbackMessage = buildFallbackMessage(intent, groups);
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    return fallbackMessage;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
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
                "You are Kavi by Kapruka, a friendly Sri Lankan shopping concierge.",
                "Write one short assistant message before deterministic product cards are shown.",
                "Do not choose, rank, invent, or modify products.",
                "Do not mention product names, prices, stock, URLs, checkout, or delivery promises.",
                "Use only the provided intent and product group labels.",
                "Mention the recipient at most once, using natural phrasing like for your mum.",
                "If searchQuery already contains the recipient, rewrite it as a clean product phrase before responding.",
                "For cake requests, prefer this style: Of course — I found some lovely birthday cakes under Rs. 6,000 for your mum. Here are my top picks.",
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
                  rawQuery: intent.rawQuery,
                  searchQuery: intent.searchQuery,
                  occasion: intent.occasion,
                  recipient: intent.recipient,
                  category: intent.category,
                  budgetMax: intent.budgetMax,
                  city: intent.city,
                  groupLabels: groups
                    .filter((group) => group.product)
                    .map((group) => group.label),
                }),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 80,
        },
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return fallbackMessage;
  }

  const data = (await response.json()) as GeminiGenerateContentResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  return text || fallbackMessage;
}

function buildFallbackMessage(intent: ShoppingIntent, groups: ProductGroup[]) {
  const productCount = groups.filter((group) => group.product).length;
  const budgetText =
    typeof intent.budgetMax === "number"
      ? ` under Rs. ${intent.budgetMax.toLocaleString("en-LK")}`
      : "";
  const recipientText = intent.recipient ? ` for your ${intent.recipient}` : "";
  const requestText = normalizeRequestText(
    intent.searchQuery || intent.category || "gift options",
    intent.recipient
  );

  if (productCount === 0) {
    return `I understood your request for ${requestText}${budgetText}${recipientText}, but I could not find matching Kapruka products just yet.`;
  }

  return `Of course — I found some lovely ${requestText}${budgetText}${recipientText}. Here are my top picks.`;
}

function normalizeRequestText(value: string, recipient: string | null) {
  let normalized = value.trim().toLowerCase();

  if (recipient) {
    const escapedRecipient = recipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized
      .replace(new RegExp(`\\s+for\\s+(your\\s+)?${escapedRecipient}\\b`, "gi"), "")
      .replace(new RegExp(`\\b(your\\s+)?${escapedRecipient}\\b`, "gi"), "")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (normalized === "birthday cake" || normalized === "birthday cakes") {
    return "birthday cakes";
  }

  return normalized || "gift options";
}
