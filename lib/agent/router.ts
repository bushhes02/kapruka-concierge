import "server-only";

import { NextResponse } from "next/server";

import { parseShoppingIntent } from "@/lib/llm/intentParser";
import { trackKaprukaOrder } from "@/lib/kapruka/order-tracking";
import { runShoppingOrchestrator } from "@/lib/orchestrator/shopping-orchestrator";
import type { ShoppingIntent } from "@/lib/ai/intent-schema";

type AgentRequestBody = {
  query?: string;
  currentCart?: Array<{ id: string; name: string; price: number | null }>;
  selectedProduct?: { id: string; name: string } | null;
};

export async function handleAgentRequest(request: Request) {
  try {
    const body = (await request.json()) as AgentRequestBody;
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json(
        { error: "Natural shopping request is required." },
        { status: 400 }
      );
    }

    const parsed = await parseShoppingIntent(query, {
      currentCart: body.currentCart || [],
      selectedProduct: body.selectedProduct || null,
    });

    if (process.env.NODE_ENV === "development") {
      console.info("Kavi agent intent", {
        extractor: parsed.intentProvider,
        intent: parsed.intent,
        replyLanguage: parsed.reply_language,
        languageStyle: parsed.languageStyle,
        translatedShoppingRequestEnglish: parsed.translatedShoppingRequestEnglish,
        searchQueryEnglish: parsed.searchQueryEnglish,
        category: parsed.category,
        confidence: parsed.confidence,
      });
    }

    if (parsed.intent === "search_products") {
      const shoppingIntent = mapParsedIntentToShoppingIntent(parsed);
      const result = await runShoppingOrchestrator(shoppingIntent);

      return NextResponse.json({
        ...result,
        intent: shoppingIntent,
      });
    }

    if (parsed.intent === "track_order") {
      const trackingReference = parsed.trackingReference || parsed.query || parsed.searchQueryEnglish;

      if (!trackingReference) {
        return NextResponse.json({
          intent: mapParsedIntentToShoppingIntent(parsed),
          delivery: {
            city: parsed.city,
            date: parsed.deliveryDateRaw,
            isComplete: Boolean(parsed.city && parsed.deliveryDateRaw),
            missingFields: [
              ...(parsed.city ? [] : ["city"]),
              ...(parsed.deliveryDateRaw ? [] : ["deliveryDate"]),
            ],
            note: parsed.clarifying_question || "Please share your order reference.",
          },
          assistantMessage:
            parsed.assistant_reply ||
            parsed.clarifying_question ||
            "Please share your order reference so I can track it.",
          products: [],
          groups: [],
        });
      }

      const tracking = await trackKaprukaOrder(trackingReference);

      return NextResponse.json({
        intent: mapParsedIntentToShoppingIntent(parsed),
        delivery: {
          city: parsed.city,
          date: parsed.deliveryDateRaw,
          isComplete: Boolean(parsed.city && parsed.deliveryDateRaw),
          missingFields: [
            ...(parsed.city ? [] : ["city"]),
            ...(parsed.deliveryDateRaw ? [] : ["deliveryDate"]),
          ],
          note: tracking.message || "Tracking details loaded.",
        },
        assistantMessage:
          tracking.message ||
          `I found tracking details for ${trackingReference}.`,
        tracking,
        products: [],
        groups: [],
      });
    }

    return NextResponse.json({
      intent: mapParsedIntentToShoppingIntent(parsed),
      delivery: {
        city: parsed.city,
        date: parsed.deliveryDateRaw,
        isComplete: Boolean(parsed.city && parsed.deliveryDateRaw),
        missingFields: [
          ...(parsed.city ? [] : ["city"]),
          ...(parsed.deliveryDateRaw ? [] : ["deliveryDate"]),
        ],
        note: parsed.assistant_reply || parsed.clarifying_question || "",
      },
      assistantMessage:
        parsed.assistant_reply ||
        parsed.clarifying_question ||
        "I understood your request.",
      products: [],
      groups: [],
    });
  } catch (error) {
    console.error("Kavi agent router error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Kavi agent routing failed.",
      },
      { status: 500 }
    );
  }
}

export function mapParsedIntentToShoppingIntent(parsed: Awaited<
  ReturnType<typeof parseShoppingIntent>
>): ShoppingIntent {
  const languageStyle = mapReplyLanguage(parsed.reply_language);

  return {
    rawQuery: parsed.rawQuery,
    intentProvider: parsed.intentProvider,
    intent: parsed.intent,
    query: parsed.query || parsed.searchQueryEnglish,
    product_reference: parsed.product_reference,
    delivery_location: parsed.delivery_location,
    reply_language: parsed.reply_language,
    clarifying_question: parsed.clarifying_question,
    assistant_reply: parsed.assistant_reply,
    detectedLanguage: parsed.detectedLanguage,
    languageStyle,
    translatedShoppingRequestEnglish: parsed.translatedShoppingRequestEnglish,
    searchQueryEnglish: parsed.searchQueryEnglish,
    searchQuery: parsed.searchQueryEnglish || parsed.query,
    occasion: parsed.occasion,
    recipient: parsed.recipient,
    recipientNormalized: parsed.recipientNormalized,
    category: parsed.category,
    budgetMax: parsed.budgetMax,
    budgetMin: parsed.budgetMin,
    city: parsed.city,
    deliveryDate: resolveDeliveryDate(parsed.deliveryDateRaw, parsed.urgency),
    deliveryDateRaw: parsed.deliveryDateRaw,
    urgency: parsed.urgency === "unknown" ? null : parsed.urgency,
    confidence: parsed.confidence,
    clarificationNeeded: parsed.clarificationNeeded,
    clarificationQuestion: parsed.clarifying_question,
    missingFields: [],
    language: languageStyle,
  };
}

function mapReplyLanguage(
  replyLanguage: ParsedReplyLanguage
): ShoppingIntent["language"] {
  switch (replyLanguage) {
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

type ParsedReplyLanguage = "english" | "sinhala" | "tamil" | "singlish" | "tanglish" | "mixed";

function resolveDeliveryDate(
  rawDate: string | null,
  urgency: string | null
) {
  if (!rawDate) {
    if (urgency === "today" || urgency === "tomorrow") {
      return null;
    }

    return null;
  }

  const normalized = rawDate.toLowerCase();
  const today = getLocalDateOnly(new Date());

  if (normalized.includes("day after tomorrow")) {
    return formatDate(addDays(today, 2));
  }

  if (normalized.includes("tomorrow")) {
    return formatDate(addDays(today, 1));
  }

  if (normalized.includes("today")) {
    return formatDate(today);
  }

  if (normalized.includes("friday")) {
    return formatDate(nextWeekday(today, 5));
  }

  const exactDate = parseIsoDate(rawDate);
  if (exactDate && !isBeforeDate(exactDate, today)) {
    return formatDate(exactDate);
  }

  return null;
}

function getLocalDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function nextWeekday(date: Date, weekday: number) {
  const nextDate = new Date(date);
  const daysUntilWeekday = (weekday - date.getDay() + 7) % 7 || 7;

  nextDate.setDate(date.getDate() + daysUntilWeekday);
  return nextDate;
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function isBeforeDate(date: Date, comparisonDate: Date) {
  return formatDate(date) < formatDate(comparisonDate);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
