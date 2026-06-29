import "server-only";

import { callKaprukaMcpTool, listKaprukaMcpTools } from "@/lib/kapruka/mcp-client";

export type DeliveryValidationResult = {
  valid: boolean;
  status: "valid" | "invalid" | "unavailable";
  city: string | null;
  date: string | null;
  checkedCity: string | null;
  checkedDate: string | null;
  rate: number | null;
  currency: string | null;
  reason: string | null;
  nextAvailableDate: string | null;
  warnings: string[];
  unavailableReason: string | null;
};

type DeliveryCheckPayload = {
  city?: unknown;
  checked_date?: unknown;
  available?: unknown;
  rate?: unknown;
  currency?: unknown;
  reason?: unknown;
  next_available_date?: unknown;
  perishable_warning?: unknown;
} | string;

type CityListPayload = {
  cities?: Array<{
    name?: unknown;
    aliases?: unknown;
  }>;
};

export async function validateKaprukaDelivery(input: {
  city: string | null;
  date: string | null;
  productId?: string | null;
}): Promise<DeliveryValidationResult> {
  if (!input.city || !input.date) {
    return {
      valid: false,
      status: "invalid",
      city: input.city,
      date: input.date,
      checkedCity: null,
      checkedDate: null,
      rate: null,
      currency: null,
      reason: "Delivery city and date are required before validation.",
      nextAvailableDate: null,
      warnings: [],
      unavailableReason: null,
    };
  }

  try {
    const tools = await listKaprukaMcpTools();
    const toolNames = new Set(tools.map((tool) => tool.name));

    if (!toolNames.has("kapruka_check_delivery")) {
      return unavailable(input, "Kapruka delivery validation MCP tool is not available.");
    }

    const checkedCity = toolNames.has("kapruka_list_delivery_cities")
      ? await resolveDeliveryCity(input.city)
      : input.city;

    if (process.env.NODE_ENV === "development") {
      console.info("Kapruka delivery validation request", {
        hasCity: Boolean(input.city),
        resolvedCity: checkedCity,
        hasDate: Boolean(input.date),
        hasProductId: Boolean(input.productId),
      });
    }

    const payload = (await callKaprukaMcpTool("kapruka_check_delivery", {
      params: {
        city: checkedCity || input.city,
        delivery_date: input.date,
        product_id: input.productId || null,
        response_format: "json",
      },
    })) as DeliveryCheckPayload;

    if (typeof payload === "string") {
      throw new Error(payload);
    }

    if (!payload || typeof payload !== "object") {
      throw new Error("Unexpected Kapruka delivery validation response.");
    }

    const available = toBooleanOrNull(payload.available);

    if (available === null) {
      throw new Error("Kapruka delivery validation response did not include availability.");
    }

    const warnings = [toStringOrNull(payload.perishable_warning)].filter(
      (warning): warning is string => Boolean(warning)
    );

    if (process.env.NODE_ENV === "development") {
      console.info("Kapruka delivery validation response", {
        status: available ? "valid" : "invalid",
        checkedCity: toStringOrNull(payload.city) || checkedCity || input.city,
        checkedDate: toStringOrNull(payload.checked_date) || input.date,
        hasReason: Boolean(toStringOrNull(payload.reason)),
        nextAvailableDate: toStringOrNull(payload.next_available_date),
        hasRate: typeof payload.rate === "number",
      });
    }

    return {
      valid: available,
      status: available ? "valid" : "invalid",
      city: input.city,
      date: input.date,
      checkedCity: toStringOrNull(payload.city) || checkedCity || input.city,
      checkedDate: toStringOrNull(payload.checked_date) || input.date,
      rate: typeof payload.rate === "number" ? payload.rate : null,
      currency: toStringOrNull(payload.currency),
      reason: toStringOrNull(payload.reason),
      nextAvailableDate: toStringOrNull(payload.next_available_date),
      warnings,
      unavailableReason: null,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.info("Kapruka delivery validation unavailable", {
        hasCity: Boolean(input.city),
        hasDate: Boolean(input.date),
        hasProductId: Boolean(input.productId),
        message: error instanceof Error ? error.message : "Unknown MCP error",
      });
    }

    return unavailable(
      input,
      error instanceof Error
        ? error.message
        : "Kapruka delivery validation MCP mapping failed."
    );
  }
}

async function resolveDeliveryCity(city: string) {
  try {
    const payload = (await callKaprukaMcpTool("kapruka_list_delivery_cities", {
      params: {
        query: city,
        limit: 10,
        response_format: "json",
      },
    })) as CityListPayload;
    const cities = Array.isArray(payload.cities) ? payload.cities : [];
    const exact = cities.find((candidate) => {
      const name = toStringOrNull(candidate.name);
      const aliases = Array.isArray(candidate.aliases)
        ? candidate.aliases.map(toStringOrNull).filter(Boolean)
        : [];

      return (
        name?.toLowerCase() === city.toLowerCase() ||
        aliases.some((alias) => alias?.toLowerCase() === city.toLowerCase())
      );
    });

    return toStringOrNull(exact?.name) || toStringOrNull(cities[0]?.name) || city;
  } catch {
    return city;
  }
}

function unavailable(
  input: { city: string | null; date: string | null },
  reason: string
): DeliveryValidationResult {
  return {
    valid: false,
    status: "unavailable",
    city: input.city,
    date: input.date,
    checkedCity: input.city,
    checkedDate: input.date,
    rate: null,
    currency: null,
    reason: null,
    nextAvailableDate: null,
    warnings: [
      "Delivery validation could not be completed. Please try again or use Kapruka checkout.",
    ],
    unavailableReason: reason,
  };
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toBooleanOrNull(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return null;
}
