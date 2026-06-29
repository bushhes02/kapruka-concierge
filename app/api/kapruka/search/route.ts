import { NextResponse } from "next/server";
import { groupProducts } from "@/lib/commerce/product-grouping";
import { searchKaprukaProducts } from "@/lib/kapruka/mcp-client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json(
        { error: "Search query is required." },
        { status: 400 }
      );
    }

    const products = await searchKaprukaProducts(query);
    const groups = groupProducts(products, query);

    return NextResponse.json({
      query,
      products,
      groups,
    });
  } catch (error) {
    console.error("Kapruka search error", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kapruka product search failed.",
      },
      { status: 500 }
    );
  }
}
