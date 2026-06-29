import { NextResponse } from "next/server";

import { getCheckoutDraftByToken } from "@/lib/checkout/checkout-draft";
import { listKaprukaMcpTools } from "@/lib/kapruka/mcp-client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { confirmationToken?: unknown };
    const checkoutDraft = getCheckoutDraftByToken(body.confirmationToken);

    if (!checkoutDraft) {
      return NextResponse.json(
        {
          error: "Invalid or expired checkout confirmation token.",
        },
        { status: 400 }
      );
    }

    let toolNames: string[] = [];

    try {
      const tools = await listKaprukaMcpTools();
      toolNames = tools.map((tool) => tool.name);

      if (process.env.NODE_ENV === "development") {
        console.info("Kapruka MCP tools", toolNames);
      }
    } catch (error) {
      console.info(
        "Kapruka MCP tools unavailable",
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    const hasCreateOrder = toolNames.includes("kapruka_create_order");

    return NextResponse.json({
      ok: false,
      status: "ready_requires_mapping",
      message: hasCreateOrder
        ? "Checkout confirmation is ready, but Kapruka order creation requires additional MCP field mapping."
        : "Checkout confirmation is ready, but no Kapruka order creation tool is available yet.",
      checkoutDraft,
      capabilities:
        process.env.NODE_ENV === "development"
          ? {
              hasCreateOrder,
              toolNames,
            }
          : {
              hasCreateOrder,
            },
    });
  } catch (error) {
    console.error("Checkout confirm error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout confirmation failed.",
      },
      { status: 500 }
    );
  }
}
