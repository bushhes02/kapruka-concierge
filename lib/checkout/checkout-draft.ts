import "server-only";

import { createHash, randomUUID } from "crypto";

import {
  validateKaprukaDelivery,
  type DeliveryValidationResult,
} from "@/lib/checkout/delivery-validation";

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

export type CheckoutDetailsInput = {
  recipientName?: unknown;
  recipientPhone?: unknown;
  deliveryAddress?: unknown;
  senderName?: unknown;
  giftMessage?: unknown;
};

export type CheckoutDetails = {
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryAddress: string | null;
  senderName: string | null;
  giftMessage: string | null;
};

export type CheckoutDraft = {
  items: CheckoutDraftItem[];
  subtotal: number;
  delivery: CheckoutDelivery;
  deliveryValidation: DeliveryValidationResult | null;
  checkoutDetails: CheckoutDetails;
  missingFields: string[];
  canConfirm: boolean;
  confirmationToken: string | null;
  warnings: string[];
};

type StoredCheckoutDraft = CheckoutDraft & {
  createdAt: number;
  contentHash: string;
};

const draftStore = new Map<string, StoredCheckoutDraft>();
const TOKEN_TTL_MS = 20 * 60 * 1000;

export async function createCheckoutDraft(input: {
  cartItems?: unknown;
  delivery?: CheckoutDeliveryInput | null;
  checkoutDetails?: CheckoutDetailsInput | null;
}): Promise<CheckoutDraft> {
  pruneExpiredDrafts();

  const missingFields: string[] = [];
  const warnings: string[] = [
    "No order will be placed until you confirm.",
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
  const checkoutDetails = normalizeCheckoutDetails(input.checkoutDetails);

  if (!delivery.city) {
    missingFields.push("delivery city");
  }

  if (!delivery.date) {
    missingFields.push("delivery date");
  }

  const deliveryValidation =
    delivery.city && delivery.date
      ? await validateKaprukaDelivery({
          city: delivery.city,
          date: delivery.date,
          productId: items[0]?.id || null,
        })
      : null;

  if (deliveryValidation) {
    warnings.push(...deliveryValidation.warnings);
  }

  if (!checkoutDetails.recipientName) {
    missingFields.push("recipient name");
  }

  if (!checkoutDetails.recipientPhone) {
    missingFields.push("recipient phone");
  } else if (!isValidSriLankaPhone(checkoutDetails.recipientPhone)) {
    missingFields.push("valid recipient phone");
  }

  if (!checkoutDetails.deliveryAddress) {
    missingFields.push("delivery address");
  }

  if (!checkoutDetails.senderName) {
    missingFields.push("sender name");
  }

  const subtotal = items.reduce((total, item) => total + item.price, 0);
  const canConfirm =
    missingFields.length === 0 && deliveryValidation?.status === "valid";
  const confirmationToken = canConfirm ? randomUUID() : null;
  const checkoutDraft: CheckoutDraft = {
    items,
    subtotal,
    delivery,
    deliveryValidation,
    checkoutDetails,
    missingFields,
    canConfirm,
    confirmationToken,
    warnings,
  };

  if (confirmationToken) {
    draftStore.set(confirmationToken, {
      ...checkoutDraft,
      createdAt: Date.now(),
      contentHash: hashDraftContent(checkoutDraft),
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

  const { createdAt: _createdAt, contentHash: _contentHash, ...checkoutDraft } = storedDraft;

  return checkoutDraft;
}

export async function revalidateCheckoutDraft(
  draft: CheckoutDraft
): Promise<CheckoutDraft> {
  const deliveryValidation =
    draft.delivery.city && draft.delivery.date
      ? await validateKaprukaDelivery({
          city: draft.delivery.city,
          date: draft.delivery.date,
          productId: draft.items[0]?.id || null,
        })
      : null;
  const missingFields = draft.missingFields.filter(
    (field) => field !== "deliverable delivery city/date"
  );

  return {
    ...draft,
    deliveryValidation,
    missingFields,
    canConfirm:
      missingFields.length === 0 && deliveryValidation?.status === "valid",
    warnings: [
      ...new Set([
        ...draft.warnings,
        ...(deliveryValidation?.warnings || []),
      ]),
    ],
  };
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

function normalizeCheckoutDetails(
  checkoutDetails: CheckoutDetailsInput | null | undefined
) {
  return {
    recipientName: toTrimmedString(checkoutDetails?.recipientName),
    recipientPhone: toTrimmedString(checkoutDetails?.recipientPhone),
    deliveryAddress: toTrimmedString(checkoutDetails?.deliveryAddress),
    senderName: toTrimmedString(checkoutDetails?.senderName),
    giftMessage: toTrimmedString(checkoutDetails?.giftMessage),
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

function isValidSriLankaPhone(phone: string) {
  const normalized = phone.replace(/[\s()-]/g, "");

  return /^(\+94|0)\d{9}$/.test(normalized) || /^\d{7,15}$/.test(normalized);
}

function hashDraftContent(draft: CheckoutDraft) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        items: draft.items.map((item) => ({
          id: item.id,
          price: item.price,
        })),
        delivery: draft.delivery,
        checkoutDetails: draft.checkoutDetails,
        subtotal: draft.subtotal,
      })
    )
    .digest("hex");
}
