import { NextResponse } from "next/server";

import { createCheckoutDraft } from "@/lib/checkout/checkout-draft";
import { listKaprukaMcpTools } from "@/lib/kapruka/mcp-client";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "development") {
      listKaprukaMcpTools()
        .then((tools) => {
          console.info(
            "Kapruka MCP tools",
            tools.map((tool) => tool.name)
          );
        })
        .catch((error) => {
          console.info(
            "Kapruka MCP tools unavailable",
            error instanceof Error ? error.message : "Unknown error"
          );
        });
    }

    const body = (await request.json()) as {
      cartItems?: unknown;
      delivery?: {
        city?: unknown;
        date?: unknown;
      };
    };
    const checkoutDraft = createCheckoutDraft({
      cartItems: body.cartItems,
      delivery: body.delivery,
    });

    return NextResponse.json({ checkoutDraft });
  } catch (error) {
    console.error("Checkout draft error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout draft creation failed.",
      },
      { status: 500 }
    );
  }
}
