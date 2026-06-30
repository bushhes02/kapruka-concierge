import { NextResponse } from "next/server";

import { trackKaprukaOrder } from "@/lib/kapruka/order-tracking";

type Body = {
  reference?: unknown;
  orderReference?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const reference =
      typeof body.reference === "string" && body.reference.trim()
        ? body.reference.trim()
        : typeof body.orderReference === "string" && body.orderReference.trim()
          ? body.orderReference.trim()
          : "";

    if (!reference) {
      return NextResponse.json(
        { error: "Order reference is required." },
        { status: 400 }
      );
    }

    const tracking = await trackKaprukaOrder(reference);

    return NextResponse.json({ tracking });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "I couldn't find tracking details for that reference. Please check the order number and try again.",
      },
      { status: 502 }
    );
  }
}
