import "server-only";

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

export async function generateGiftMessageSuggestion(input: {
  rawQuery: string;
  occasion: string | null;
  recipientNormalized: string | null;
  languageStyle: "en" | "singlish" | "tanglish" | "si" | "ta" | "mixed" | "unknown";
}) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    return buildFallbackGiftMessage(input);
  }

  const assistantStyle = input.languageStyle === "unknown" ? "en" : input.languageStyle;

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
                  "You write short, warm gift messages for a Sri Lankan shopping concierge.",
                  "Do not mention products, prices, stock, order numbers, delivery promises, or checkout details.",
                  "Write one short message only.",
                  "Keep it editable and natural.",
                  "Match the user's language style.",
                  "Use occasion and recipient if helpful.",
                  "Return only plain text.",
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
                    rawQuery: input.rawQuery,
                    occasion: input.occasion,
                    recipientNormalized: input.recipientNormalized,
                    languageStyle: assistantStyle,
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
      const text = await response.text();

      if (isModelNotFoundError(response.status, text)) {
        continue;
      }

      return buildFallbackGiftMessage(input);
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (text) {
      return text;
    }
  }

  return buildFallbackGiftMessage(input);
}

function buildFallbackGiftMessage(input: {
  occasion: string | null;
  recipientNormalized: string | null;
}) {
  const recipient = input.recipientNormalized || "you";

  if (input.occasion === "birthday") {
    return `Happy birthday ${recipient}! Wishing you a wonderful day filled with love and joy.`;
  }

  if (input.occasion === "anniversary") {
    return `Happy anniversary ${recipient}! Wishing you many more beautiful years together.`;
  }

  return `With best wishes for ${recipient}.`;
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
