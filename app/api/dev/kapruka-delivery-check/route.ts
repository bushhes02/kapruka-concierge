import { NextResponse } from "next/server";

import { validateKaprukaDelivery } from "@/lib/checkout/delivery-validation";
import { listKaprukaMcpTools } from "@/lib/kapruka/mcp-client";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const city = url.searchParams.get("city") || "Colombo";
  const date = url.searchParams.get("date") || "2026-07-01";
  const productId = url.searchParams.get("productId") || "FLOWERS00T2101";
  const tools = await listKaprukaMcpTools();
  const checkDeliveryTool = tools.find(
    (tool) => tool.name === "kapruka_check_delivery"
  );
  const result = await validateKaprukaDelivery({
    city,
    date,
    productId,
  });

  return NextResponse.json({
    schema: checkDeliveryTool
      ? {
          name: checkDeliveryTool.name,
          inputSchema: checkDeliveryTool.inputSchema,
        }
      : null,
    requestSummary: {
      city,
      date,
      productId,
      argumentShape: {
        params: {
          city,
          delivery_date: date,
          product_id: productId,
          response_format: "json",
        },
      },
    },
    result,
  });
}
