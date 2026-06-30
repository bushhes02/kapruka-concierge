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
  cakeIcingText?: unknown;
};

export type CheckoutDetails = {
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryAddress: string | null;
  senderName: string | null;
  giftMessage: string | null;
  cakeIcingText: string | null;
};

export type CheckoutDraft = {
  items: CheckoutDraftItem[];
  subtotal: number;
  delivery: CheckoutDelivery;
  deliveryValidation: DeliveryValidationResult | null;
  checkoutDetails: CheckoutDetails;
  missingFields: string[];
  validationErrors: string[];
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
  const validationErrors: string[] = [];
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

  warnings.push(...getPerishableWarnings(items));

  const checkoutDetailErrors = validateCheckoutDetails(checkoutDetails);

  if (!checkoutDetails.recipientName) {
    missingFields.push("recipient name");
  } else if (checkoutDetailErrors.includes("recipient name")) {
    missingFields.push("recipient name");
  }

  if (!checkoutDetails.recipientPhone) {
    missingFields.push("recipient phone");
  } else if (checkoutDetailErrors.includes("valid recipient phone")) {
    missingFields.push("valid recipient phone");
  }

  if (!checkoutDetails.deliveryAddress) {
    missingFields.push("delivery address");
  } else if (checkoutDetailErrors.includes("delivery address")) {
    missingFields.push("delivery address");
  }

  if (!checkoutDetails.senderName) {
    missingFields.push("sender name");
  } else if (checkoutDetailErrors.includes("sender name")) {
    missingFields.push("sender name");
  }

  validationErrors.push(...checkoutDetailErrors.map(getCheckoutDetailErrorMessage));

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
    validationErrors,
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

export function consumeCheckoutDraftToken(token: unknown): CheckoutDraft | null {
  pruneExpiredDrafts();

  if (typeof token !== "string" || !token.trim()) {
    return null;
  }

  const storedDraft = draftStore.get(token);

  if (!storedDraft) {
    return null;
  }

  if (storedDraft.contentHash !== hashDraftContent(storedDraft)) {
    draftStore.delete(token);
    return null;
  }

  draftStore.delete(token);

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
  const checkoutDetailErrors = validateCheckoutDetails(draft.checkoutDetails);
  const validationErrors = checkoutDetailErrors.map(getCheckoutDetailErrorMessage);

  for (const field of checkoutDetailErrors) {
    if (!missingFields.includes(field)) {
      missingFields.push(field);
    }
  }

  return {
    ...draft,
    deliveryValidation,
    missingFields,
    validationErrors,
    canConfirm:
      missingFields.length === 0 && deliveryValidation?.status === "valid",
    warnings: [
      ...new Set([
        ...draft.warnings,
        ...(deliveryValidation?.warnings || []),
        ...getPerishableWarnings(draft.items),
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
    cakeIcingText: toTrimmedString(checkoutDetails?.cakeIcingText),
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

export function validateCheckoutDetails(details: CheckoutDetails) {
  const errors: string[] = [];

  if (!details.recipientName || details.recipientName.trim().length < 2) {
    errors.push("recipient name");
  }

  if (!details.recipientPhone || !isValidSriLankaPhone(details.recipientPhone)) {
    errors.push("valid recipient phone");
  }

  if (!details.deliveryAddress || details.deliveryAddress.trim().length < 5) {
    errors.push("delivery address");
  }

  if (!details.senderName || details.senderName.trim().length < 2) {
    errors.push("sender name");
  }

  return errors;
}

function getCheckoutDetailErrorMessage(field: string) {
  if (field === "delivery address") {
    return "Delivery address must be at least 5 characters.";
  }

  if (field === "recipient name") {
    return "Recipient name must be at least 2 characters.";
  }

  if (field === "sender name") {
    return "Sender name must be at least 2 characters.";
  }

  if (field === "valid recipient phone") {
    return "Enter a valid Sri Lankan recipient phone number.";
  }

  return field;
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
        cakeIcingText: draft.checkoutDetails.cakeIcingText,
        subtotal: draft.subtotal,
      })
    )
    .digest("hex");
}

function getPerishableWarnings(items: CheckoutDraftItem[]) {
  const names = items
    .map((item) => `${item.id} ${item.name} ${item.displayName}`.toLowerCase())
    .join(" | ");
  const warnings = new Set<string>();

  if (names.includes("cake")) {
    warnings.add(
      "Cake orders are time-sensitive. Please double-check delivery date, address, and recipient phone."
    );
  }

  if (names.includes("flower") || names.includes("rose") || names.includes("bouquet")) {
    warnings.add(
      "Flower availability and freshness can depend on delivery date and location."
    );
  }

  if (
    ["chocolate", "hamper", "fruit", "food", "perishable"].some((term) =>
      names.includes(term)
    )
  ) {
    warnings.add("This item may be time-sensitive. Please confirm delivery details carefully.");
  }

  return Array.from(warnings);
}
