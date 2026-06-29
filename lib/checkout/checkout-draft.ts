import "server-only";

import { randomUUID } from "crypto";

export type CheckoutDraftItemInput = {
  id?: unknown;
  name?: unknown;
  displayName?: unknown;
  price?: unknown;
  priceText?: unknown;
  url?: unknown;
  stockStatus?: unknown;
  imageUrl?: unknown;
  displayImageUrl?: unknown;
};

export type CheckoutDraftItem = {
  id: string;
  name: string;
  displayName: string;
  price: number;
  priceText: string;
  url: string;
  stockStatus: string | null;
  imageUrl: string | null;
};

export type CheckoutDeliveryInput = {
  city?: unknown;
  date?: unknown;
};

export type CheckoutDelivery = {
  city: string | null;
  date: string | null;
};

export type CheckoutDraft = {
  items: CheckoutDraftItem[];
  subtotal: number;
  delivery: CheckoutDelivery;
  missingFields: string[];
  canConfirm: boolean;
  confirmationToken: string | null;
  warnings: string[];
};

type StoredCheckoutDraft = CheckoutDraft & {
  createdAt: number;
};

const draftStore = new Map<string, StoredCheckoutDraft>();
const TOKEN_TTL_MS = 20 * 60 * 1000;

export function createCheckoutDraft(input: {
  cartItems?: unknown;
  delivery?: CheckoutDeliveryInput | null;
}): CheckoutDraft {
  pruneExpiredDrafts();

  const missingFields: string[] = [];
  const warnings: string[] = [
    "No order will be placed until you confirm.",
    "Kapruka order creation is not enabled until MCP field mapping is verified.",
  ];
  const rawItems = Array.isArray(input.cartItems) ? input.cartItems : [];
  const items: CheckoutDraftItem[] = [];

  if (rawItems.length === 0) {
    missingFields.push("cart items");
  }

  rawItems.forEach((rawItem, index) => {
    const item = normalizeDraftItem(rawItem);

    if (item) {
      items.push(item);
      return;
    }

    missingFields.push(`cart item ${index + 1} product details`);
  });

  const delivery = normalizeDelivery(input.delivery);

  if (!delivery.city) {
    missingFields.push("delivery city");
  }

  if (!delivery.date) {
    missingFields.push("delivery date");
  }

  const subtotal = items.reduce((total, item) => total + item.price, 0);
  const canConfirm = missingFields.length === 0;
  const confirmationToken = canConfirm ? randomUUID() : null;
  const checkoutDraft: CheckoutDraft = {
    items,
    subtotal,
    delivery,
    missingFields,
    canConfirm,
    confirmationToken,
    warnings,
  };

  if (confirmationToken) {
    draftStore.set(confirmationToken, {
      ...checkoutDraft,
      createdAt: Date.now(),
    });
  }

  return checkoutDraft;
}

export function getCheckoutDraftByToken(token: unknown): CheckoutDraft | null {
  pruneExpiredDrafts();

  if (typeof token !== "string" || !token.trim()) {
    return null;
  }

  const storedDraft = draftStore.get(token);

  if (!storedDraft) {
    return null;
  }

  const { createdAt: _createdAt, ...checkoutDraft } = storedDraft;

  return checkoutDraft;
}

function normalizeDraftItem(rawItem: unknown): CheckoutDraftItem | null {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const item = rawItem as CheckoutDraftItemInput;
  const id = toTrimmedString(item.id);
  const sourceName = toTrimmedString(item.name);
  const displayName = toTrimmedString(item.displayName) || sourceName;
  const price = typeof item.price === "number" && Number.isFinite(item.price)
    ? item.price
    : null;
  const url = toTrimmedString(item.url);

  if (!id || !sourceName || !displayName || price === null || !url) {
    return null;
  }

  return {
    id,
    name: sourceName,
    displayName,
    price,
    priceText: toTrimmedString(item.priceText) || `Rs. ${price.toLocaleString("en-LK")}`,
    url,
    stockStatus: toTrimmedString(item.stockStatus),
    imageUrl: toTrimmedString(item.displayImageUrl) || toTrimmedString(item.imageUrl),
  };
}

function normalizeDelivery(delivery: CheckoutDeliveryInput | null | undefined) {
  return {
    city: toTrimmedString(delivery?.city),
    date: toTrimmedString(delivery?.date),
  };
}

function pruneExpiredDrafts() {
  const now = Date.now();

  for (const [token, draft] of draftStore.entries()) {
    if (now - draft.createdAt > TOKEN_TTL_MS) {
      draftStore.delete(token);
    }
  }
}

function toTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
