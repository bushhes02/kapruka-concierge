import "server-only";

import type { ProductGroup } from "@/lib/commerce/product-grouping";
import type { ShoppingIntent } from "@/lib/ai/intent-schema";
import type { DeliveryInfo } from "@/lib/orchestrator/shopping-orchestrator";

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
  delivery,
  groups,
}: {
  intent: ShoppingIntent;
  delivery: DeliveryInfo;
  groups: ProductGroup[];
}) {
  const fallbackMessage = buildFallbackMessage(intent, delivery, groups);
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
                "Use natural category labels: cakes, flowers, chocolate gifts, or gifts.",
                "Do not repeat raw searchQuery phrases with city or recipient words attached.",
                "Mention the recipient at most once, using natural phrasing like for your mum.",
                "If searchQuery already contains the recipient, rewrite it as a clean product phrase before responding.",
                "For cake requests, prefer this style: Of course — I found some lovely birthday cakes under Rs. 6,000 for your mum. Here are my top picks.",
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
                text: JSON.stringify({
                  rawQuery: intent.rawQuery,
                  searchQuery: intent.searchQuery,
                  occasion: intent.occasion,
                  recipient: intent.recipient,
                  category: intent.category,
                  budgetMax: intent.budgetMax,
                  delivery,
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

function buildFallbackMessage(
  intent: ShoppingIntent,
  delivery: DeliveryInfo,
  groups: ProductGroup[]
) {
  const productCount = groups.filter((group) => group.product).length;
  const budgetText =
    typeof intent.budgetMax === "number"
      ? ` under Rs. ${intent.budgetMax.toLocaleString("en-LK")}`
      : "";
  const recipientText = intent.recipient ? ` for your ${intent.recipient}` : "";
  const requestText = getDisplayCategory(intent);

  if (productCount === 0) {
    return `I understood your request for ${requestText}${budgetText}${recipientText}, but I could not find matching Kapruka products just yet.${buildDeliveryFollowUp(delivery)}`;
  }

  return `Of course — I found some lovely ${requestText}${budgetText}${recipientText}${formatDeliveryContext(delivery)}. Here are my top picks.${buildDeliveryFollowUp(delivery)}`;
}

function getDisplayCategory(intent: ShoppingIntent) {
  const text = [
    intent.rawQuery,
    intent.searchQuery,
    intent.category,
    intent.occasion,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("birthday") && text.includes("cake")) {
    return "birthday cakes";
  }

  if (text.includes("cake")) {
    return "cakes";
  }

  if (text.includes("flower") || text.includes("rose") || text.includes("bouquet")) {
    return text.includes("anniversary") ? "anniversary flowers" : "flowers";
  }

  if (
    text.includes("chocolate") ||
    text.includes("hamper") ||
    text.includes("confectionery")
  ) {
    return "chocolate gifts";
  }

  return "gifts";
}

function formatDeliveryContext(delivery: DeliveryInfo) {
  if (delivery.city && delivery.date) {
    return ` for delivery to ${delivery.city} on ${delivery.date}`;
  }

  if (delivery.city) {
    return ` for delivery to ${delivery.city}`;
  }

  if (delivery.date) {
    return ` for ${formatRelativeOrIsoDate(delivery.date)}`;
  }

  return "";
}

function buildDeliveryFollowUp(delivery: DeliveryInfo) {
  if (delivery.isComplete || delivery.missingFields.length === 0) {
    return "";
  }

  const missingText = delivery.missingFields
    .map((field) => (field === "deliveryDate" ? "delivery date" : "delivery city"))
    .join(" and ");

  return ` I'll need the ${missingText} to continue.`;
}

function formatRelativeOrIsoDate(date: string) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date === formatDate(today)) {
    return "today";
  }

  if (date === formatDate(tomorrow)) {
    return "tomorrow";
  }

  return date;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
