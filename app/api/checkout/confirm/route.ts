import { NextResponse } from "next/server";

import {
  consumeCheckoutDraftToken,
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
    const checkoutDraft = consumeCheckoutDraftToken(body.confirmationToken);

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
          status: "validation_failed",
          message:
            "Checkout cannot be confirmed until delivery and checkout details are complete.",
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
    const giftMessage = buildGiftMessage(revalidatedDraft.checkoutDetails);
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
        gift_message: giftMessage,
        currency: "LKR",
        response_format: "json",
      },
    };
    const orderResult = await callKaprukaMcpTool(
      "kapruka_create_order",
      orderPayload
    );
    const checkoutResult = summarizeCreateOrderResult(orderResult);

    if (!checkoutResult.paymentLink) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          message: checkoutResult.safeReason
            ? `Order could not be created. ${checkoutResult.safeReason}`
            : "Order could not be created. Please check the checkout details and try again.",
          checkoutDraft: revalidatedDraft,
          checkoutResult,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: "success",
      message: "Order draft created. Complete payment on Kapruka.",
      checkoutDraft: revalidatedDraft,
      checkoutResult,
    });
  } catch (error) {
    console.error(
      "Checkout confirm error",
      normalizeMcpError(error instanceof Error ? error.message : "Unknown error")
    );

    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        message:
          "Order could not be created. Please check the checkout details and try again.",
        error: normalizeMcpError(
          error instanceof Error ? error.message : "Checkout confirmation failed."
        ),
      },
      { status: 502 }
    );
  }
}

function summarizeCreateOrderResult(result: unknown) {
  if (typeof result === "string") {
    return {
      paymentLink: null,
      orderRef: null,
      expiresAt: null,
      summary: null,
      error: normalizeMcpError(result),
      safeReason: normalizeMcpError(result),
    };
  }

  if (!result || typeof result !== "object") {
    return {
      paymentLink: null,
      orderRef: null,
      expiresAt: null,
      summary: null,
      error: "Unexpected Kapruka order response.",
      safeReason: "Unexpected Kapruka order response.",
    };
  }

  const record = result as Record<string, unknown>;
  const summary = record.summary;

  return {
    paymentLink: toTrimmedString(record.checkout_url),
    orderRef:
      toTrimmedString(record.order_ref) ||
      toTrimmedString(record.order_number) ||
      toTrimmedString(record.order_id),
    expiresAt: toTrimmedString(record.expires_at),
    summary: summary && typeof summary === "object" ? summary : null,
    error: normalizeMcpError(toTrimmedString(record.error)),
    safeReason: normalizeMcpError(toTrimmedString(record.error)),
  };
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeMcpError(error: string | null) {
  if (!error) {
    return null;
  }

  const lower = error.toLowerCase();

  if (
    lower.includes("delivery.address") ||
    lower.includes("string_too_short") ||
    lower.includes("at least 3 characters")
  ) {
    return "Delivery address is too short.";
  }

  if (lower.includes("recipient.phone") || lower.includes("phone")) {
    return "Recipient phone number is invalid.";
  }

  if (lower.includes("recipient.name")) {
    return "Recipient name is incomplete.";
  }

  if (lower.includes("sender.name")) {
    return "Sender name is incomplete.";
  }

  if (lower.includes("city_not_deliverable")) {
    return "Delivery is not available for this city.";
  }

  if (lower.includes("date_not_deliverable")) {
    return "Delivery is not available for this date.";
  }

  if (lower.includes("product_out_of_stock")) {
    return "One of the selected products is out of stock.";
  }

  if (lower.includes("product_not_found")) {
    return "One of the selected products could not be found.";
  }

  return "Please check the checkout details and try again.";
}

function buildGiftMessage(details: {
  giftMessage: string | null;
  cakeIcingText: string | null;
}) {
  const giftMessage = details.giftMessage?.trim() || "";
  const cakeIcingText = details.cakeIcingText?.trim() || "";

  if (giftMessage && cakeIcingText) {
    return `${giftMessage}\nCake icing: ${cakeIcingText}`;
  }

  return giftMessage || cakeIcingText || null;
}
