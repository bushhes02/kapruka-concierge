import { NextResponse } from "next/server";

import { createCheckoutDraft } from "@/lib/checkout/checkout-draft";
import { logKaprukaMcpToolSummaries } from "@/lib/kapruka/mcp-client";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "development") {
      logKaprukaMcpToolSummaries().catch((error) => {
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
      checkoutDetails?: {
        recipientName?: unknown;
        recipientPhone?: unknown;
        deliveryAddress?: unknown;
        senderName?: unknown;
        giftMessage?: unknown;
        cakeIcingText?: unknown;
      };
    };
    const checkoutDraft = await createCheckoutDraft({
      cartItems: body.cartItems,
      delivery: body.delivery,
      checkoutDetails: body.checkoutDetails,
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
