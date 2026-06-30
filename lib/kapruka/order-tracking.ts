import "server-only";

import { callKaprukaMcpTool } from "@/lib/kapruka/mcp-client";

export type OrderTrackingResult = {
  found: boolean;
  reference: string;
  status: string | null;
  message: string | null;
  updatedAt: string | null;
  raw: unknown;
};

export async function trackKaprukaOrder(reference: string): Promise<OrderTrackingResult> {
  const cleanReference = reference.trim();

  const payloadCandidates = [
    { params: { order_reference: cleanReference, response_format: "json" } },
    { params: { order_ref: cleanReference, response_format: "json" } },
    { params: { order_number: cleanReference, response_format: "json" } },
    { params: { reference: cleanReference, response_format: "json" } },
  ];

  let lastError: unknown = null;

  for (const payload of payloadCandidates) {
    try {
      const result = await callKaprukaMcpTool("kapruka_track_order", payload);
      return normalizeTrackingResult(cleanReference, result);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Kapruka order tracking failed.");
}

function normalizeTrackingResult(reference: string, result: unknown): OrderTrackingResult {
  if (!result || typeof result !== "object") {
    return {
      found: false,
      reference,
      status: null,
      message: null,
      updatedAt: null,
      raw: result,
    };
  }

  const record = result as Record<string, unknown>;

  return {
    found: Boolean(record.found ?? record.status ?? record.message),
    reference,
    status: toStringOrNull(record.status || record.order_status || record.state),
    message: toStringOrNull(record.message || record.summary || record.note),
    updatedAt: toStringOrNull(record.updated_at || record.updatedAt || record.last_updated_at),
    raw: result,
  };
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
