import { NextResponse } from "next/server";

import { runShoppingOrchestrator } from "@/lib/orchestrator/shopping-orchestrator";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json(
        { error: "Natural shopping request is required." },
        { status: 400 }
      );
    }

    const result = await runShoppingOrchestrator(query);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Kavi shopping orchestrator error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kavi shopping orchestration failed.",
      },
      { status: 500 }
    );
  }
}
