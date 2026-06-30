import { NextResponse } from "next/server";

import { generateGiftMessageSuggestion } from "@/lib/ai/gemini-gift-message";

type Body = {
  rawQuery?: unknown;
  occasion?: unknown;
  recipientNormalized?: unknown;
  languageStyle?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const rawQuery = typeof body.rawQuery === "string" ? body.rawQuery : "";

    if (!rawQuery.trim()) {
      return NextResponse.json(
        { error: "Gift message generation requires a shopping request." },
        { status: 400 }
      );
    }

    const message = await generateGiftMessageSuggestion({
      rawQuery,
      occasion: typeof body.occasion === "string" ? body.occasion : null,
      recipientNormalized:
        typeof body.recipientNormalized === "string" ? body.recipientNormalized : null,
      languageStyle:
        body.languageStyle === "singlish" ||
        body.languageStyle === "tanglish" ||
        body.languageStyle === "si" ||
        body.languageStyle === "ta" ||
        body.languageStyle === "mixed"
          ? body.languageStyle
          : "en",
    });

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Gift message generation failed.",
      },
      { status: 500 }
    );
  }
}
