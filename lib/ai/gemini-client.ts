import "server-only";

import type { ProductGroup } from "@/lib/commerce/product-grouping";
import type { ShoppingIntent } from "@/lib/ai/intent-schema";
import type { DeliveryInfo } from "@/lib/orchestrator/shopping-orchestrator";

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

export async function generateKaviAssistantMessage({
  intent,
  delivery,
  groups,
}: {
  intent: ShoppingIntent;
  delivery: DeliveryInfo;
  groups: ProductGroup[];
}) {
  const fallbackMessage = buildEmergencyFallbackMessage(intent, groups);
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const assistantStyle = getAssistantLanguageStyle(intent);
  const replyLanguageInstruction = getReplyLanguageInstruction(
    intent,
    assistantStyle
  );

  if (!apiKey) {
    return fallbackMessage;
  }

  for (const model of GEMINI_MODELS) {
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
                  "You are Kavi by Kapruka, a friendly Sri Lankan shopping concierge.",
                  "Write one short assistant message before deterministic product cards are shown.",
                  "Do not choose, rank, invent, or modify products.",
                  "Do not mention product names, prices, stock, URLs, checkout, or delivery promises.",
                  "Use only the provided intent, delivery metadata, and whether product groups exist.",
                  "Your main job is to write the response in the same language and script style as the user's rawQuery.",
                  "Do not translate a Singlish, Tanglish, Sinhala, Tamil, or mixed reply back into plain English.",
                  "If the user used romanized Sinhala/Singlish, reply in romanized Sinhala/Singlish.",
                  "If the user used romanized Tamil/Tanglish, reply in romanized Tamil/Tanglish.",
                  "Follow replyLanguageInstruction exactly.",
                  "If the user typed romanized Sinhala/Singlish, reply in romanized Sinhala/Singlish, not formal English.",
                  "If the user typed romanized Tamil/Tanglish, reply in romanized Tamil/Tanglish, not formal English.",
                  "If the user typed Sinhala script, reply in Sinhala script or Sinhala-English mixed only if the user mixed English terms.",
                  "If the user typed Tamil script, reply in Tamil script or Tamil-English mixed only if the user mixed English terms.",
                  "If the user typed English, reply in English.",
                  "Use the user's own tone lightly. Do not use a fixed template or canned phrase.",
                  "Do not overdo slang; keep checkout and safety language clear.",
                  "If product group labels are included, never ask what category the user wants; say that you found suitable options.",
                  "Only ask a clarification question when clarificationNeeded is true and no product group labels are included.",
                  "If a clarificationQuestion is provided and products are not included, ask it naturally in the user's language/style.",
                  "Use recipientNormalized for kinship wording when present.",
                  "Do not say grandma unless recipientNormalized is grandmother.",
                  "If recipientNormalized is dad, refer to father/dad or the user's matching local kinship style.",
                  "Mention the recipient at most once.",
                  "Only mention delivery city and date when they are provided in delivery.",
                  "If delivery is incomplete, politely ask for the missing delivery field after introducing the product picks.",
                  "Do not guarantee delivery availability or create orders.",
                ].join(" "),
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    `Raw user query: ${intent.rawQuery}`,
                    `Reply language instruction: ${replyLanguageInstruction}`,
                    "Intent and deterministic product context:",
                    JSON.stringify({
                      searchQuery: intent.searchQuery,
                      searchQueryEnglish: intent.searchQueryEnglish,
                      translatedShoppingRequestEnglish:
                        intent.translatedShoppingRequestEnglish,
                      occasion: intent.occasion,
                      recipient: intent.recipient,
                      recipientNormalized: intent.recipientNormalized,
                      category: intent.category,
                      budgetMax: intent.budgetMax,
                      language: intent.language,
                      languageStyle: intent.languageStyle,
                      detectedLanguage: intent.detectedLanguage,
                      confidence: intent.confidence,
                      clarificationNeeded: intent.clarificationNeeded,
                      missingFields: intent.missingFields,
                      delivery,
                      groupLabels: groups
                        .filter((group) => group.product)
                        .map((group) => group.label),
                      hasProducts: groups.some((group) => Boolean(group.product)),
                    }),
                  ].join("\n"),
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
      if (isModelNotFoundError(response.status, await response.text())) {
        continue;
      }

      return fallbackMessage;
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      return fallbackMessage;
    }

    return sanitizeAssistantMessage(text, fallbackMessage);
  }

  return fallbackMessage;
}

function sanitizeAssistantMessage(message: string, fallbackMessage: string) {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return fallbackMessage;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (
    wordCount < 3 ||
    normalized.length < 14 ||
    /^(here|ok|okay|sure|yes|done|alright|thanks?)\.?$/i.test(normalized) ||
    /^(here is|here are)\b/i.test(normalized) && wordCount < 5
  ) {
    return fallbackMessage;
  }

  return normalized;
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

function getAssistantLanguageStyle(intent: ShoppingIntent) {
  if (intent.languageStyle && intent.languageStyle !== "unknown") {
    return intent.languageStyle;
  }

  const detectedLanguage = (intent.detectedLanguage || "").toLowerCase();

  if (detectedLanguage.includes("singlish")) {
    return "singlish";
  }

  if (detectedLanguage.includes("tanglish")) {
    return "tanglish";
  }

  if (detectedLanguage.includes("sinhala")) {
    return "si";
  }

  if (detectedLanguage.includes("tamil")) {
    return "ta";
  }

  if (detectedLanguage.includes("mixed")) {
    return "mixed";
  }

  switch (intent.reply_language) {
    case "singlish":
      return "singlish";
    case "tanglish":
      return "tanglish";
    case "sinhala":
      return "si";
    case "tamil":
      return "ta";
    case "mixed":
      return "mixed";
    case "english":
    default:
      return "en";
  }
}

function getReplyLanguageInstruction(
  intent: ShoppingIntent,
  assistantStyle: ReturnType<typeof getAssistantLanguageStyle>
) {
  const rawQuery = intent.rawQuery;

  if (/[\u0d80-\u0dff]/.test(rawQuery)) {
    return "Reply primarily in Sinhala script, preserving English product words if the user used them.";
  }

  if (/[\u0b80-\u0bff]/.test(rawQuery)) {
    return "Reply primarily in Tamil script, preserving English product words if the user used them.";
  }

  if (assistantStyle === "singlish") {
    return "Reply in light romanized Sinhala/Singlish, matching the user's typed style.";
  }

  if (assistantStyle === "tanglish") {
    return "Reply in light romanized Tamil/Tanglish, matching the user's typed style.";
  }

  if (assistantStyle === "si") {
    return "Reply in Sinhala or Sinhala-English mixed style matching the user's rawQuery.";
  }

  if (assistantStyle === "ta") {
    return "Reply in Tamil or Tamil-English mixed style matching the user's rawQuery.";
  }

  if (assistantStyle === "mixed") {
    return "Reply in the dominant language/style of the user's rawQuery, preserving their code-mixed tone.";
  }

  return "Reply in English.";
}

function buildEmergencyFallbackMessage(
  intent: ShoppingIntent,
  groups: ProductGroup[]
) {
  if (intent.clarificationNeeded && !groups.some((group) => group.product)) {
    return intent.clarificationQuestion || "Could you clarify what you want to send?";
  }

  if (groups.some((group) => group.product)) {
    return "I found some matching options. Here are the top picks.";
  }

  const query =
    intent.translatedShoppingRequestEnglish ||
    intent.searchQueryEnglish ||
    intent.rawQuery;

  return `I understood you're looking for ${query}, but I couldn't find relevant Kapruka products for that search.`;
}
