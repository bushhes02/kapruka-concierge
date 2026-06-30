import { NextResponse } from "next/server";

import { buildSmartUpsell } from "@/lib/commerce/smart-upsell";

type Body = {
  cartItems?: Array<{ id: string; name: string; price?: number | null; displayName?: string | null }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const cartItems = Array.isArray(body.cartItems) ? body.cartItems : [];

    if (cartItems.length === 0) {
      return NextResponse.json({ category: "other", queries: [], products: [] });
    }

    const upsell = await buildSmartUpsell({ cartItems });

    return NextResponse.json(upsell);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upsell lookup failed.",
      },
      { status: 500 }
    );
  }
}
