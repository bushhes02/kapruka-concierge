import { NextResponse } from "next/server";

import {
  getCheckoutDraftByToken,
  revalidateCheckoutDraft,
} from "@/lib/checkout/checkout-draft";
import {
  callKaprukaMcpTool,
  listKaprukaMcpTools,
  logKaprukaMcpToolSummaries,
} from "@/lib/kapruka/mcp-client";

type ConfirmBody = {
  confirmationToken?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConfirmBody;
    const checkoutDraft = getCheckoutDraftByToken(body.confirmationToken);

    if (!checkoutDraft) {
      return NextResponse.json(
        {
          error: "Invalid or expired checkout confirmation token.",
        },
        { status: 400 }
      );
    }

    const revalidatedDraft = await revalidateCheckoutDraft(checkoutDraft);

    if (!revalidatedDraft.canConfirm) {
      return NextResponse.json(
        {
          ok: false,
          status: "delivery_validation_failed",
          message:
            "Checkout cannot be confirmed until delivery is valid and required fields are complete.",
          checkoutDraft: revalidatedDraft,
        },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      logKaprukaMcpToolSummaries().catch(() => undefined);
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
    const recipientName = revalidatedDraft.checkoutDetails.recipientName;
    const recipientPhone = revalidatedDraft.checkoutDetails.recipientPhone;
    const deliveryAddress = revalidatedDraft.checkoutDetails.deliveryAddress;
    const senderName = revalidatedDraft.checkoutDetails.senderName;
    const missingOrderFields = [
      recipientName ? null : "recipient name",
      recipientPhone ? null : "recipient phone",
      deliveryAddress ? null : "delivery address",
      senderName ? null : "sender name",
    ].filter((field): field is string => Boolean(field));

    if (!hasCreateOrder) {
      return NextResponse.json({
        ok: false,
        status: "order_tool_unavailable",
        message:
          "Checkout draft is ready, but no Kapruka order creation tool is available yet.",
        checkoutDraft: revalidatedDraft,
        capabilities: { hasCreateOrder },
      });
    }

    if (missingOrderFields.length > 0) {
      return NextResponse.json({
        ok: false,
        status: "order_mapping_incomplete",
        message:
          "Checkout draft is ready, but live order creation is not enabled yet. Recipient phone, delivery address, and sender details must be collected before calling Kapruka order creation.",
        checkoutDraft: revalidatedDraft,
        missingOrderFields,
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
    }

    const orderPayload = {
      params: {
        cart: revalidatedDraft.items.map((item) => ({
          product_id: item.id,
          quantity: 1,
        })),
        recipient: {
          name: recipientName,
          phone: recipientPhone,
        },
        delivery: {
          address: deliveryAddress,
          city:
            revalidatedDraft.deliveryValidation?.checkedCity ||
            revalidatedDraft.delivery.city,
          location_type: "house",
          date:
            revalidatedDraft.deliveryValidation?.checkedDate ||
            revalidatedDraft.delivery.date,
          instructions: null,
        },
        sender: {
          name: senderName,
          anonymous: false,
        },
        gift_message: revalidatedDraft.checkoutDetails.giftMessage,
        currency: "LKR",
        response_format: "json",
      },
    };
    const orderResult = await callKaprukaMcpTool(
      "kapruka_create_order",
      orderPayload
    );

    return NextResponse.json({
      ok: true,
      status: "order_created",
      message: "Kapruka checkout link created. Open it to complete payment.",
      checkoutDraft: revalidatedDraft,
      checkoutResult: orderResult,
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
