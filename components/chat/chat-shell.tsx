"use client";

import { useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  displayName?: string | null;
  price: number | null;
  priceText: string;
  imageUrl: string | null;
  displayImageUrl?: string | null;
  description?: string | null;
  sourceName?: string;
  stockStatus: string | null;
  url: string | null;
  raw: unknown;
};

type ProductGroup = {
  label: "Best Match" | "Best Value" | "Premium Pick";
  reason: string;
  product: Product | null;
};

type ShoppingIntent = {
  rawQuery: string;
  searchQuery: string | null;
  occasion: string | null;
  recipient: string | null;
  category: string | null;
  budgetMax: number | null;
  budgetMin: number | null;
  city: string | null;
  deliveryDate: string | null;
  urgency: "normal" | "urgent" | "scheduled" | null;
  language: string | null;
};

type DeliveryInfo = {
  city: string | null;
  date: string | null;
  isComplete: boolean;
  missingFields: Array<"city" | "deliveryDate">;
  note: string;
};

type SearchResponse = {
  intent: ShoppingIntent;
  delivery: DeliveryInfo;
  assistantMessage: string;
  products: Product[];
  groups: ProductGroup[];
  error?: string;
};

type CheckoutDraftItem = {
  id: string;
  name: string;
  displayName: string;
  price: number;
  priceText: string;
  url: string;
  stockStatus: string | null;
  imageUrl: string | null;
};

type CheckoutDraft = {
  items: CheckoutDraftItem[];
  subtotal: number;
  delivery: {
    city: string | null;
    date: string | null;
  };
  deliveryValidation: {
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
  } | null;
  checkoutDetails: CheckoutDetails;
  missingFields: string[];
  canConfirm: boolean;
  confirmationToken: string | null;
  warnings: string[];
};

type CheckoutDetails = {
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  senderName: string;
  giftMessage: string;
};

type CheckoutDeliveryDetails = {
  city: string;
  date: string;
};

type CheckoutConfirmResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
  checkoutResult?: unknown;
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "chat" | "cart_summary";
  result?: SearchResponse;
};

type PipelineStep = "idle" | "understanding" | "searching" | "composing";

type CheckoutController = {
  draft: CheckoutDraft | null;
  error: string | null;
  message: string | null;
  result: unknown;
  details: CheckoutDetails;
  deliveryDetails: CheckoutDeliveryDetails;
  onDetailsChange: (details: CheckoutDetails) => void;
  onDeliveryChange: (details: CheckoutDeliveryDetails) => void;
  onUseNextAvailableDate: (date: string) => void;
  isReviewing: boolean;
  isConfirming: boolean;
  onReview: () => void;
  onConfirm: () => void;
};

const samplePrompts = [
  "I need a birthday cake under 6000 for my mum",
  "Send anniversary flowers to Colombo tomorrow",
  "Chocolate hamper for my dad under 8000",
];

export function ChatShell() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      type: "chat",
      content:
        "Hi, I am Kavi by Kapruka. Tell me what you need, who it is for, and where it should go.",
    },
  ]);
  const [cart, setCart] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [latestDelivery, setLatestDelivery] = useState<DeliveryInfo | null>(null);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<unknown>(null);
  const [checkoutDetails, setCheckoutDetails] = useState<CheckoutDetails>({
    recipientName: "",
    recipientPhone: "",
    deliveryAddress: "",
    senderName: "",
    giftMessage: "",
  });
  const [checkoutDelivery, setCheckoutDelivery] = useState<CheckoutDeliveryDetails>({
    city: "",
    date: "",
  });
  const [isReviewingCheckout, setIsReviewingCheckout] = useState(false);
  const [isConfirmingCheckout, setIsConfirmingCheckout] = useState(false);

  const cartIds = useMemo(() => new Set(cart.map((item) => item.id)), [cart]);
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (total, product) =>
          total + (typeof product.price === "number" ? product.price : 0),
        0
      ),
    [cart]
  );

  async function sendMessage(messageText: string) {
    const cleanQuery = messageText.trim();

    if (!cleanQuery) {
      setError("Type a shopping request first.");
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        role: "user",
        type: "chat",
        content: cleanQuery,
      },
    ]);
    setQuery("");
    setIsSearching(true);
    setPipelineStep("understanding");
    setError(null);

    const searchingTimer = window.setTimeout(() => {
      setPipelineStep("searching");
    }, 450);
    const composingTimer = window.setTimeout(() => {
      setPipelineStep("composing");
    }, 1300);

    try {
      const response = await fetch("/api/rani/shopping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: cleanQuery }),
      });
      const data = (await response.json()) as SearchResponse;

      if (!response.ok) {
        throw new Error(data.error || "Product search failed.");
      }

      setLatestDelivery(data.delivery);
      setCheckoutDelivery({
        city: data.delivery.city || "",
        date: data.delivery.date || "",
      });
      setCheckoutDraft(null);
      setCheckoutMessage(null);
      setCheckoutError(null);
      setCheckoutResult(null);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          type: "chat",
          content: data.assistantMessage,
          result: data,
        },
      ]);
    } catch (searchError) {
      const message =
        searchError instanceof Error
          ? searchError.message
          : "Product search failed.";

      setError(message);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          type: "chat",
          content: message,
        },
      ]);
    } finally {
      window.clearTimeout(searchingTimer);
      window.clearTimeout(composingTimer);
      setIsSearching(false);
      setPipelineStep("idle");
    }
  }

  function addToCart(product: Product) {
    setCart((currentCart) => {
      if (currentCart.some((item) => item.id === product.id)) {
        return currentCart;
      }

      return [...currentCart, product];
    });
    upsertCartSummaryMessage();
    setCartNotice("Added to cart.");
    setCheckoutDraft(null);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setCheckoutResult(null);
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) =>
      currentCart.filter((product) => product.id !== productId)
    );
    setMessages((currentMessages) => {
      if (cart.length <= 1) {
        return currentMessages.filter((message) => message.type !== "cart_summary");
      }

      return currentMessages;
    });
    setCartNotice(null);
    setCheckoutDraft(null);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setCheckoutResult(null);
  }

  function upsertCartSummaryMessage() {
    setMessages((currentMessages) => [
      ...currentMessages.filter((message) => message.type !== "cart_summary"),
      {
        id: "inline-cart-summary",
        role: "assistant",
        type: "cart_summary",
        content: "Added to cart",
      },
    ]);
  }

  function updateCheckoutDetails(details: CheckoutDetails) {
    setCheckoutDetails(details);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setCheckoutResult(null);
  }

  function updateCheckoutDelivery(details: CheckoutDeliveryDetails) {
    setCheckoutDelivery(details);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setCheckoutResult(null);
  }

  function useNextAvailableDate(date: string) {
    const nextDelivery = {
      ...checkoutDelivery,
      date,
    };

    setCheckoutDelivery(nextDelivery);
    setCheckoutDraft(null);
    setCheckoutMessage(null);
    setCheckoutError(null);
    setCheckoutResult(null);
    void reviewCheckout(nextDelivery);
  }

  async function reviewCheckout(deliveryForReview = checkoutDelivery) {
    setIsReviewingCheckout(true);
    setCheckoutError(null);
    setCheckoutMessage(null);
    setCheckoutResult(null);

    try {
      const response = await fetch("/api/checkout/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cartItems: cart,
          delivery: {
            city: deliveryForReview.city || null,
            date: deliveryForReview.date || null,
          },
          checkoutDetails,
        }),
      });
      const data = (await response.json()) as {
        checkoutDraft?: CheckoutDraft;
        error?: string;
      };

      if (!response.ok || !data.checkoutDraft) {
        throw new Error(data.error || "Checkout review failed.");
      }

      setCheckoutDraft(data.checkoutDraft);
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout review failed."
      );
    } finally {
      setIsReviewingCheckout(false);
    }
  }

  async function confirmCheckout() {
    if (!checkoutDraft?.confirmationToken) {
      return;
    }

    setIsConfirmingCheckout(true);
    setCheckoutError(null);
    setCheckoutMessage(null);

    try {
      const response = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmationToken: checkoutDraft.confirmationToken,
        }),
      });
      const data = (await response.json()) as CheckoutConfirmResponse;

      if (!response.ok) {
        throw new Error(data.error || "Checkout confirmation failed.");
      }

      setCheckoutMessage(
        data.message ||
          "Checkout confirmation is ready, but order creation is not enabled yet."
      );
      setCheckoutResult(data.checkoutResult || null);
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout confirmation failed."
      );
    } finally {
      setIsConfirmingCheckout(false);
    }
  }

  const checkoutController: CheckoutController = {
    draft: checkoutDraft,
    error: checkoutError,
    message: checkoutMessage,
    result: checkoutResult,
    details: checkoutDetails,
    deliveryDetails: checkoutDelivery,
    onDetailsChange: updateCheckoutDetails,
    onDeliveryChange: updateCheckoutDelivery,
    onUseNextAvailableDate: useNextAvailableDate,
    isReviewing: isReviewingCheckout,
    isConfirming: isConfirmingCheckout,
    onReview: () => void reviewCheckout(),
    onConfirm: () => void confirmCheckout(),
  };

  return (
    <main className="kavi-shell">
      <style>{styles}</style>
      <header className="kavi-header">
        <div className="kavi-header-inner">
          <div className="kavi-brand">
            <div className="kavi-logo">K</div>
            <div>
              <h1>Kavi by Kapruka</h1>
              <p>AI gift concierge</p>
            </div>
          </div>
          <button
            className="cart-button"
            type="button"
            onClick={() => setIsCartOpen((open) => !open)}
            aria-label="Open cart"
          >
            <span className="cart-glyph" aria-hidden="true" />
            <span>Cart</span>
            <strong>{cart.length}</strong>
          </button>
        </div>
      </header>

      <section className="chat-scroll">
        <div className="chat-column">
          {messages.map((message) => (
            message.type === "cart_summary" ? (
              <InlineCheckoutSummary
                key={message.id}
                cart={cart}
                subtotal={subtotal}
                checkout={checkoutController}
              />
            ) : (
              <ChatBubble
                key={message.id}
                message={message}
                cartIds={cartIds}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            )
          ))}

          {isSearching ? <PipelineStatus activeStep={pipelineStep} /> : null}
          {error ? <div className="error-note">{error}</div> : null}
        </div>
      </section>

      <footer className="composer-shell">
        <div className="composer-inner">
          <div className="prompt-row">
            {samplePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isSearching}
                onClick={() => void sendMessage(prompt)}
                className="prompt-chip"
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(query);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask Kavi for cakes, flowers, hampers..."
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? "..." : "Send"}
            </button>
          </form>
        </div>
      </footer>

      {isCartOpen ? (
        <CartDrawer
          cart={cart}
          subtotal={subtotal}
          notice={cartNotice}
          checkout={checkoutController}
          onClose={() => setIsCartOpen(false)}
          onRemove={removeFromCart}
        />
      ) : null}
    </main>
  );
}

function PipelineStatus({ activeStep }: { activeStep: PipelineStep }) {
  const steps: Array<{ id: PipelineStep; label: string }> = [
    { id: "understanding", label: "Understanding" },
    { id: "searching", label: "Searching Kapruka" },
    { id: "composing", label: "Reply ready" },
  ];
  const activeIndex = steps.findIndex((step) => step.id === activeStep);

  return (
    <div className="pipeline active">
      {steps.map((step, index) => (
        <span
          key={step.id}
          className={index <= activeIndex ? "pipeline-step active" : "pipeline-step"}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}

function PipelineComplete() {
  return (
    <div className="pipeline complete">
      Understood by Groq <span /> Products from Kapruka <span /> Reply by Gemini
    </div>
  );
}

function ChatBubble({
  message,
  cartIds,
  onAdd,
  onRemove,
}: {
  message: ChatMessage;
  cartIds: Set<string>;
  onAdd: (product: Product) => void;
  onRemove: (productId: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <article className={isUser ? "message user" : "message assistant"}>
      {!isUser ? <div className="avatar">K</div> : null}
      <div className="message-body">
        <div className="message-bubble">
          {message.content}
          {!isUser ? <ModelBadge /> : null}
        </div>
        {message.result ? (
          <div className="result-block">
            <PipelineComplete />
            <IntentChips intent={message.result.intent} />
            <GroupedProducts
              response={message.result}
              cartIds={cartIds}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ModelBadge() {
  return <div className="model-badge">Kavi · Gemini Flash</div>;
}

function IntentChips({ intent }: { intent: ShoppingIntent }) {
  const chips = [
    ["category", intent.category],
    ["occasion", intent.occasion],
    ["recipient", intent.recipient],
    ["city", intent.city],
    ["delivery", intent.deliveryDate],
    ["budget", formatBudget(intent)],
    ["language", intent.language],
  ].filter(([, value]) => value);

  if (chips.length === 0) {
    return null;
  }

  return (
    <section className="intent-panel">
      <div className="intent-caption">Groq intent</div>
      <div className="intent-chips">
        {chips.map(([label, value]) => (
          <span key={label} className="intent-chip">
            <strong>{label}</strong> {value}
          </span>
        ))}
      </div>
    </section>
  );
}

function GroupedProducts({
  response,
  cartIds,
  onAdd,
  onRemove,
}: {
  response: SearchResponse;
  cartIds: Set<string>;
  onAdd: (product: Product) => void;
  onRemove: (productId: string) => void;
}) {
  const groupedIds = new Set(
    response.groups
      .map((group) => group.product?.id)
      .filter((id): id is string => Boolean(id))
  );
  const moreOptions = response.products
    .filter((product) => !groupedIds.has(product.id))
    .slice(0, 15);

  return (
    <div className="products-section">
      <div className="highlight-grid">
        {response.groups.map((group) =>
          group.product ? (
            <ProductCard
              key={`${group.label}-${group.product.id}`}
              product={group.product}
              label={group.label}
              reason={group.reason}
              isInCart={cartIds.has(group.product.id)}
              onAdd={() => onAdd(group.product as Product)}
              onRemove={() => onRemove(group.product?.id || "")}
              highlighted
            />
          ) : null
        )}
      </div>

      {moreOptions.length > 0 ? (
        <div className="more-section">
          <div className="section-title">More options</div>
          <div className="more-rail">
            {moreOptions.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isInCart={cartIds.has(product.id)}
                onAdd={() => onAdd(product)}
                onRemove={() => onRemove(product.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InlineCheckoutSummary({
  cart,
  subtotal,
  checkout,
}: {
  cart: Product[];
  subtotal: number;
  checkout: CheckoutController;
}) {
  const missingDeliveryWarnings = getCheckoutDeliveryWarnings(checkout.deliveryDetails);

  return (
    <article className="message assistant inline-checkout-message">
      <div className="avatar">K</div>
      <div className="message-body">
        <div className="inline-checkout-card">
          <div className="inline-checkout-head">
            <div>
              <p className="eyebrow">Cart draft</p>
              <h2>I’ve added this to your cart. Here’s your current order draft.</h2>
            </div>
            <strong>Rs. {subtotal.toLocaleString("en-LK")}</strong>
          </div>

          <div className="inline-cart-list">
            {cart.map((product) => (
              <div key={product.id} className="inline-cart-item">
                <span>{getProductDisplayName(product)}</span>
                <strong>{product.priceText}</strong>
              </div>
            ))}
          </div>

          <div className="inline-delivery">
            <span>Delivery</span>
            <p>
              City: {checkout.deliveryDetails.city || "Missing"} · Date:{" "}
              {checkout.deliveryDetails.date || "Missing"}
            </p>
            {missingDeliveryWarnings.map((warning) => (
              <p key={warning} className="warning">
                {warning}
              </p>
            ))}
          </div>

          <CheckoutPanel
            checkout={checkout}
            compact
            cartLength={cart.length}
          />
        </div>
      </div>
    </article>
  );
}

function CartDrawer({
  cart,
  subtotal,
  notice,
  checkout,
  onClose,
  onRemove,
}: {
  cart: Product[];
  subtotal: number;
  notice: string | null;
  checkout: CheckoutController;
  onClose: () => void;
  onRemove: (productId: string) => void;
}) {
  const missingDeliveryWarnings = getCheckoutDeliveryWarnings(checkout.deliveryDetails);

  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close cart" />
      <aside className="cart-drawer">
        <div className="drawer-header">
          <div>
            <h2>Cart</h2>
            <p>{cart.length} selected item(s)</p>
          </div>
          <button type="button" onClick={onClose} className="ghost-button">
            Close
          </button>
        </div>

        {notice ? <p className="cart-notice">{notice}</p> : null}

        {cart.length === 0 ? (
          <p className="empty-cart">Add products from Kavi's recommendations to review them here.</p>
        ) : (
          <div className="cart-items">
            {cart.map((product) => (
              <CartItem key={product.id} product={product} onRemove={onRemove} />
            ))}
          </div>
        )}

        <div className="cart-summary">
          <div className="subtotal-row">
            <span>Subtotal</span>
            <strong>Rs. {subtotal.toLocaleString("en-LK")}</strong>
          </div>
          <div className="delivery-box">
            <h3>Delivery summary</h3>
            <p>
              City: {checkout.deliveryDetails.city || "Missing"} · Date:{" "}
              {checkout.deliveryDetails.date || "Missing"}
            </p>
            {missingDeliveryWarnings.map((warning) => (
              <p key={warning} className="warning">
                {warning}
              </p>
            ))}
          </div>
          {cart.length > 1 ? (
            <p className="handoff-note">
              For this prototype, open each selected product on Kapruka to complete checkout.
            </p>
          ) : null}

          <CheckoutPanel checkout={checkout} cartLength={cart.length} />
        </div>
      </aside>
    </div>
  );
}

function CheckoutPanel({
  checkout,
  cartLength,
  compact = false,
}: {
  checkout: CheckoutController;
  cartLength: number;
  compact?: boolean;
}) {
  const needsCheckoutDetails =
    checkout.draft?.missingFields.some((field) =>
      [
        "recipient name",
        "recipient phone",
        "valid recipient phone",
        "delivery address",
        "sender name",
      ].includes(field)
    ) || false;
  const needsDeliveryCorrection =
    checkout.draft?.deliveryValidation?.status === "invalid" ||
    checkout.draft?.deliveryValidation?.status === "unavailable";

  return (
    <div className={compact ? "checkout-panel compact" : "checkout-panel"}>
      <p className="confirmation-gate">
        No order will be placed until you confirm.
      </p>
      <button
        type="button"
        className="review-button"
        onClick={checkout.onReview}
        disabled={checkout.isReviewing || cartLength === 0}
      >
        {checkout.isReviewing ? "Reviewing..." : "Review checkout"}
      </button>

      {checkout.error ? <p className="checkout-error">{checkout.error}</p> : null}

      {checkout.draft ? (
        <div className="checkout-draft">
          <h3>Checkout draft</h3>
          <div className="draft-lines">
            <p>
              Items: {checkout.draft.items.length} · Subtotal: Rs.{" "}
              {checkout.draft.subtotal.toLocaleString("en-LK")}
            </p>
            <p>
              Delivery: {checkout.draft.delivery.city || "Missing city"} ·{" "}
              {checkout.draft.delivery.date || "Missing date"}
            </p>
          </div>
          {checkout.draft.deliveryValidation ? (
            <div className="delivery-validation">
              <strong>
                {formatDeliveryValidationStatus(
                  checkout.draft.deliveryValidation.status,
                  checkout.draft.delivery.city,
                  checkout.draft.delivery.date
                )}
              </strong>
              <p>
                {checkout.draft.deliveryValidation.checkedCity ||
                  checkout.draft.delivery.city ||
                  "Unknown city"}
                {" · "}
                {checkout.draft.deliveryValidation.checkedDate ||
                  checkout.draft.delivery.date ||
                  "Unknown date"}
                {typeof checkout.draft.deliveryValidation.rate === "number"
                  ? ` · Delivery Rs. ${checkout.draft.deliveryValidation.rate.toLocaleString("en-LK")}`
                  : ""}
              </p>
              {checkout.draft.deliveryValidation.reason ? (
                <p className="warning">{checkout.draft.deliveryValidation.reason}</p>
              ) : null}
              {checkout.draft.deliveryValidation.nextAvailableDate ? (
                <div className="next-date-row">
                  <p className="warning">
                    Next available date: {checkout.draft.deliveryValidation.nextAvailableDate}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      checkout.onUseNextAvailableDate(
                        checkout.draft?.deliveryValidation?.nextAvailableDate || ""
                      )
                    }
                  >
                    Use next available date
                  </button>
                </div>
              ) : null}
              {checkout.draft.deliveryValidation.unavailableReason ? (
                <p className="handoff-note">
                  {checkout.draft.deliveryValidation.unavailableReason}
                </p>
              ) : null}
            </div>
          ) : null}
          {needsDeliveryCorrection ? (
            <DeliveryCorrectionForm checkout={checkout} />
          ) : null}
          {checkout.draft.missingFields.length > 0 ? (
            <p className="warning">
              Missing: {checkout.draft.missingFields.join(", ")}.
            </p>
          ) : null}
          <p className="details-status">
            Checkout details:{" "}
            {needsCheckoutDetails ? "needed before confirmation" : "complete"}
          </p>
          {needsCheckoutDetails ? (
            <CheckoutDetailsForm
              details={checkout.details}
              onChange={checkout.onDetailsChange}
            />
          ) : null}
          {checkout.draft.warnings.map((warning) => (
            <p key={warning} className="handoff-note">
              {warning}
            </p>
          ))}
          {checkout.draft.canConfirm ? (
            <button
              type="button"
              className="confirm-button"
              onClick={checkout.onConfirm}
              disabled={!checkout.draft.confirmationToken || checkout.isConfirming}
            >
              {checkout.isConfirming ? "Confirming..." : "Confirm order"}
            </button>
          ) : null}
        </div>
      ) : null}

      {checkout.message ? (
        <p className="checkout-message">{checkout.message}</p>
      ) : null}
      {getCheckoutUrl(checkout.result) ? (
        <div className="payment-link-box">
          <a href={getCheckoutUrl(checkout.result) || "#"} target="_blank" rel="noreferrer">
            Open Kapruka payment link
          </a>
          {getCheckoutExpiry(checkout.result) ? (
            <p>Expires: {getCheckoutExpiry(checkout.result)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeliveryCorrectionForm({
  checkout,
}: {
  checkout: CheckoutController;
}) {
  return (
    <div className="delivery-correction-form">
      <h4>Adjust delivery</h4>
      <p>Choose another date or city to continue.</p>
      <label>
        Delivery city
        <input
          value={checkout.deliveryDetails.city}
          onChange={(event) =>
            checkout.onDeliveryChange({
              ...checkout.deliveryDetails,
              city: event.target.value,
            })
          }
        />
      </label>
      <label>
        Delivery date
        <input
          type="date"
          value={checkout.deliveryDetails.date}
          onChange={(event) =>
            checkout.onDeliveryChange({
              ...checkout.deliveryDetails,
              date: event.target.value,
            })
          }
        />
      </label>
      <button
        type="button"
        className="review-button"
        onClick={checkout.onReview}
        disabled={checkout.isReviewing}
      >
        {checkout.isReviewing ? "Checking..." : "Recheck delivery"}
      </button>
    </div>
  );
}

function CheckoutDetailsForm({
  details,
  onChange,
}: {
  details: CheckoutDetails;
  onChange: (details: CheckoutDetails) => void;
}) {
  function updateField(field: keyof CheckoutDetails, value: string) {
    onChange({
      ...details,
      [field]: value,
    });
  }

  return (
    <div className="checkout-details-form">
      <h4>Checkout details</h4>
      <p>These details go only to checkout, not to Kavi or the AI models.</p>
      <label>
        Recipient name
        <input
          value={details.recipientName}
          onChange={(event) => updateField("recipientName", event.target.value)}
          autoComplete="name"
        />
      </label>
      <label>
        Recipient phone
        <input
          value={details.recipientPhone}
          onChange={(event) => updateField("recipientPhone", event.target.value)}
          autoComplete="tel"
          inputMode="tel"
          placeholder="0771234567"
        />
      </label>
      <label>
        Delivery address
        <textarea
          value={details.deliveryAddress}
          onChange={(event) => updateField("deliveryAddress", event.target.value)}
          rows={2}
        />
      </label>
      <label>
        Sender name
        <input
          value={details.senderName}
          onChange={(event) => updateField("senderName", event.target.value)}
          autoComplete="name"
        />
      </label>
      <label>
        Gift message <span>optional</span>
        <textarea
          value={details.giftMessage}
          onChange={(event) => updateField("giftMessage", event.target.value)}
          rows={2}
          maxLength={300}
        />
      </label>
      <p className="handoff-note">Click Review checkout again after saving details.</p>
    </div>
  );
}

function CartItem({
  product,
  onRemove,
}: {
  product: Product;
  onRemove: (productId: string) => void;
}) {
  const displayName = getProductDisplayName(product);
  const displayImageUrl = getProductDisplayImageUrl(product);

  return (
    <div className="cart-item">
      <ProductThumb imageUrl={displayImageUrl} name={displayName} />
      <div className="cart-item-copy">
        <h3>{displayName}</h3>
        <p>
          {product.priceText} · Qty 1
        </p>
        {product.stockStatus ? <span>{product.stockStatus}</span> : null}
        <div className="cart-actions">
          {product.url ? (
            <a href={product.url} target="_blank" rel="noreferrer">
              Open on Kapruka
            </a>
          ) : null}
          <button type="button" onClick={() => onRemove(product.id)}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  label,
  reason,
  isInCart,
  onAdd,
  onRemove,
  highlighted = false,
}: {
  product: Product;
  label?: string;
  reason?: string;
  isInCart: boolean;
  onAdd: () => void;
  onRemove: () => void;
  highlighted?: boolean;
}) {
  const displayName = getProductDisplayName(product);
  const displayImageUrl = getProductDisplayImageUrl(product);

  return (
    <article className={highlighted ? "product-card highlighted" : "product-card"}>
      <div className="image-wrap">
        <ProductThumb imageUrl={displayImageUrl} name={displayName} />
        {label ? <span className="group-badge">{label}</span> : null}
      </div>
      <div className="product-copy">
        <h3>
          {product.url ? (
            <a href={product.url} target="_blank" rel="noreferrer">
              {displayName}
            </a>
          ) : (
            displayName
          )}
        </h3>
        <p className="price">{product.priceText}</p>
        {product.stockStatus ? <span className="stock">{product.stockStatus}</span> : null}
        {reason ? <p className="reason">{reason}</p> : null}
      </div>
      <button type="button" onClick={isInCart ? onRemove : onAdd} className="add-button">
        {isInCart ? "Remove" : "Add to Cart"}
      </button>
    </article>
  );
}

function ProductThumb({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  return (
    <div className="product-thumb">
      {imageUrl ? (
        <img src={imageUrl} alt={name} />
      ) : (
        <span>No image</span>
      )}
    </div>
  );
}

function formatBudget(intent: ShoppingIntent) {
  if (intent.budgetMin !== null && intent.budgetMax !== null) {
    return `Rs. ${intent.budgetMin.toLocaleString("en-LK")} - Rs. ${intent.budgetMax.toLocaleString("en-LK")}`;
  }

  if (intent.budgetMax !== null) {
    return `Under Rs. ${intent.budgetMax.toLocaleString("en-LK")}`;
  }

  if (intent.budgetMin !== null) {
    return `From Rs. ${intent.budgetMin.toLocaleString("en-LK")}`;
  }

  return null;
}

function getMissingDeliveryWarnings(delivery: DeliveryInfo | null) {
  if (!delivery || delivery.isComplete) {
    return [];
  }

  return delivery.missingFields.map((field) =>
    field === "city"
      ? "Delivery city is missing."
      : "Delivery date is missing."
  );
}

function getCheckoutDeliveryWarnings(delivery: CheckoutDeliveryDetails) {
  const warnings: string[] = [];

  if (!delivery.city.trim()) {
    warnings.push("Delivery city is missing.");
  }

  if (!delivery.date.trim()) {
    warnings.push("Delivery date is missing.");
  }

  return warnings;
}

function formatDeliveryValidationStatus(
  status: "valid" | "invalid" | "unavailable",
  city: string | null,
  date: string | null
) {
  if (status === "valid") {
    return "Delivery available.";
  }

  if (status === "invalid") {
    return `Delivery is not available for ${city || "this city"} on ${
      date || "this date"
    }.`;
  }

  return "Delivery validation could not be completed.";
}

function getCheckoutUrl(result: unknown) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;
  const checkoutUrl = record.checkout_url;

  return typeof checkoutUrl === "string" && checkoutUrl.trim()
    ? checkoutUrl.trim()
    : null;
}

function getCheckoutExpiry(result: unknown) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as Record<string, unknown>;
  const expiresAt = record.expires_at;

  return typeof expiresAt === "string" && expiresAt.trim()
    ? expiresAt.trim()
    : null;
}

function getProductDisplayName(product: Product) {
  return product.displayName || product.name;
}

function getProductDisplayImageUrl(product: Product) {
  return product.displayImageUrl || product.imageUrl;
}

const styles = `
  :root {
    --kavi-purple: #4b007d;
    --kavi-purple-soft: #f5eff9;
    --kavi-yellow: #ffd400;
    --text: #211827;
    --muted: #756b7e;
    --line: #e9e2ee;
    --card: #ffffff;
    --bg: #fbf9fd;
  }

  .kavi-shell {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    font-family: Arial, Helvetica, sans-serif;
  }

  .kavi-header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(255, 255, 255, 0.9);
    border-bottom: 1px solid var(--line);
    backdrop-filter: blur(16px);
  }

  .kavi-header-inner {
    max-width: 1120px;
    margin: 0 auto;
    padding: 12px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .kavi-brand {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }

  .kavi-logo {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--kavi-purple);
    color: var(--kavi-yellow);
    display: grid;
    place-items: center;
    font-weight: 900;
    flex: 0 0 auto;
  }

  .kavi-brand h1 {
    margin: 0;
    font-size: 18px;
    line-height: 1.1;
    color: var(--text);
  }

  .kavi-brand p {
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--muted);
  }

  .cart-button {
    border: 1px solid #e1d5e9;
    background: #fff;
    color: var(--kavi-purple);
    border-radius: 999px;
    padding: 9px 12px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(75, 0, 125, 0.08);
  }

  .cart-button strong {
    min-width: 22px;
    height: 22px;
    border-radius: 999px;
    display: inline-grid;
    place-items: center;
    background: var(--kavi-yellow);
    color: var(--kavi-purple);
    font-size: 12px;
  }

  .cart-glyph {
    width: 15px;
    height: 12px;
    border: 2px solid var(--kavi-purple);
    border-top: none;
    border-radius: 0 0 3px 3px;
    display: inline-block;
  }

  .chat-scroll {
    min-height: 0;
    overflow-y: auto;
  }

  .chat-column {
    max-width: 980px;
    margin: 0 auto;
    padding: 28px 18px 36px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .message {
    display: grid;
    gap: 10px;
  }

  .message.assistant {
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: start;
  }

  .message.user {
    justify-items: end;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--kavi-purple);
    color: var(--kavi-yellow);
    display: grid;
    place-items: center;
    font-weight: 900;
    margin-top: 3px;
  }

  .message-body {
    min-width: 0;
  }

  .message-bubble {
    width: fit-content;
    max-width: min(760px, 100%);
    padding: 13px 15px;
    border-radius: 18px;
    line-height: 1.55;
    font-size: 15px;
  }

  .assistant .message-bubble {
    background: #fff;
    border: 1px solid var(--line);
    box-shadow: 0 10px 30px rgba(54, 30, 74, 0.06);
  }

  .user .message-bubble {
    background: var(--kavi-purple);
    color: #fff;
    border-bottom-right-radius: 6px;
  }

  .model-badge {
    margin-top: 8px;
    color: #8a8192;
    font-size: 11px;
    font-weight: 700;
  }

  .result-block {
    margin-top: 12px;
    max-width: 100%;
  }

  .pipeline {
    color: var(--muted);
    font-size: 12px;
  }

  .pipeline.active {
    align-self: center;
    display: flex;
    gap: 8px;
    align-items: center;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 8px 10px;
    box-shadow: 0 10px 30px rgba(54, 30, 74, 0.06);
  }

  .pipeline.complete {
    margin: 0 0 10px 42px;
  }

  .pipeline.complete span::before {
    content: "·";
    margin: 0 6px;
  }

  .pipeline-step {
    color: #9a91a2;
    font-weight: 700;
  }

  .pipeline-step.active {
    color: var(--kavi-purple);
  }

  .pipeline-step + .pipeline-step::before {
    content: "→";
    color: #c5bdca;
    margin: 0 8px 0 0;
  }

  .intent-panel {
    margin: 0 0 12px 42px;
  }

  .intent-caption {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 7px;
  }

  .intent-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .intent-chip {
    border-radius: 999px;
    background: #f3eef7;
    color: #5f536a;
    padding: 6px 9px;
    font-size: 12px;
  }

  .intent-chip strong {
    color: var(--kavi-purple);
    margin-right: 4px;
  }

  .products-section {
    margin-left: 42px;
  }

  .inline-checkout-message {
    margin-top: -4px;
  }

  .inline-checkout-card {
    max-width: 760px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: 0 12px 32px rgba(54, 30, 74, 0.07);
    padding: 14px;
  }

  .inline-checkout-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: flex-start;
    border-bottom: 1px solid var(--line);
    padding-bottom: 12px;
  }

  .inline-checkout-head .eyebrow {
    margin: 0 0 4px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .inline-checkout-head h2 {
    margin: 0;
    color: var(--text);
    font-size: 15px;
    line-height: 1.35;
  }

  .inline-checkout-head strong {
    color: var(--kavi-purple);
    white-space: nowrap;
  }

  .inline-cart-list {
    display: grid;
    gap: 8px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }

  .inline-cart-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    color: #473d50;
    font-size: 13px;
  }

  .inline-cart-item span {
    min-width: 0;
    line-height: 1.35;
  }

  .inline-cart-item strong {
    color: var(--kavi-purple);
    font-size: 12px;
    white-space: nowrap;
  }

  .inline-delivery {
    padding: 11px 0 0;
  }

  .inline-delivery span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 800;
  }

  .inline-delivery p {
    margin: 4px 0 0;
    color: #62586b;
    font-size: 13px;
  }

  .inline-delivery .warning {
    color: var(--kavi-purple);
    font-weight: 800;
  }

  .highlight-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .more-section {
    margin-top: 18px;
  }

  .section-title {
    color: #5b5064;
    font-size: 13px;
    font-weight: 800;
    margin-bottom: 9px;
  }

  .more-rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 230px;
    gap: 12px;
    overflow-x: auto;
    padding: 3px 2px 12px;
    scroll-snap-type: x proximity;
  }

  .product-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 12px 32px rgba(54, 30, 74, 0.07);
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: 278px;
    scroll-snap-align: start;
  }

  .product-card.highlighted {
    min-height: 308px;
    border-color: #e7d7ef;
  }

  .image-wrap {
    position: relative;
  }

  .product-thumb {
    background: #faf8fb;
    aspect-ratio: 4 / 3;
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  .product-thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 10px;
  }

  .product-thumb span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }

  .group-badge {
    position: absolute;
    left: 10px;
    top: 10px;
    background: var(--kavi-yellow);
    color: var(--kavi-purple);
    border-radius: 999px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 900;
  }

  .product-copy {
    padding: 11px 12px 8px;
    min-width: 0;
  }

  .product-copy h3 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .product-copy h3 a {
    color: inherit;
  }

  .price {
    margin: 8px 0 0;
    color: var(--kavi-purple);
    font-weight: 900;
  }

  .stock {
    display: inline-block;
    margin-top: 6px;
    color: #6f6577;
    background: #f5f2f7;
    border-radius: 999px;
    padding: 4px 7px;
    font-size: 11px;
    font-weight: 700;
  }

  .reason {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .add-button {
    margin: 0 12px 12px;
    border: none;
    border-radius: 999px;
    background: var(--kavi-yellow);
    color: var(--kavi-purple);
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .composer-shell {
    position: sticky;
    bottom: 0;
    background: rgba(251, 249, 253, 0.92);
    border-top: 1px solid var(--line);
    backdrop-filter: blur(16px);
    padding: 10px 18px 16px;
  }

  .composer-inner {
    max-width: 900px;
    margin: 0 auto;
  }

  .prompt-row {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 9px;
  }

  .prompt-chip {
    flex: 0 0 auto;
    border: 1px solid var(--line);
    background: #fff;
    color: #62586b;
    border-radius: 999px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .composer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 22px;
    padding: 8px;
    box-shadow: 0 14px 38px rgba(54, 30, 74, 0.08);
  }

  .composer input {
    border: none;
    outline: none;
    min-width: 0;
    padding: 9px 10px;
    color: var(--text);
    font-size: 15px;
    background: transparent;
  }

  .composer button {
    border: none;
    border-radius: 999px;
    background: var(--kavi-yellow);
    color: var(--kavi-purple);
    padding: 9px 15px;
    font-weight: 900;
    cursor: pointer;
  }

  .drawer-layer {
    position: fixed;
    inset: 0;
    z-index: 50;
    pointer-events: none;
  }

  .drawer-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(34, 23, 42, 0.18);
    pointer-events: auto;
  }

  .cart-drawer {
    position: absolute;
    right: 16px;
    top: 72px;
    bottom: 16px;
    width: min(390px, calc(100vw - 32px));
    background: #fff;
    color: var(--text);
    border-radius: 20px;
    box-shadow: 0 30px 80px rgba(41, 19, 57, 0.28);
    border: 1px solid var(--line);
    padding: 16px;
    overflow-y: auto;
    pointer-events: auto;
  }

  .drawer-header,
  .subtotal-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }

  .drawer-header h2 {
    margin: 0;
    font-size: 18px;
  }

  .drawer-header p,
  .empty-cart,
  .handoff-note {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .ghost-button,
  .cart-actions button {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--kavi-purple);
    border-radius: 999px;
    padding: 7px 10px;
    font-weight: 800;
    cursor: pointer;
  }

  .cart-notice {
    margin: 12px 0 0;
    color: var(--kavi-purple);
    font-weight: 800;
  }

  .cart-items {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .cart-item {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 10px;
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 10px;
  }

  .cart-item .product-thumb {
    border-radius: 10px;
    aspect-ratio: 1;
  }

  .cart-item-copy h3 {
    margin: 0;
    font-size: 13px;
    line-height: 1.35;
  }

  .cart-item-copy p {
    margin: 5px 0 0;
    color: var(--kavi-purple);
    font-weight: 800;
  }

  .cart-item-copy span {
    display: inline-block;
    margin-top: 5px;
    color: var(--muted);
    font-size: 12px;
  }

  .cart-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 9px;
  }

  .cart-actions a {
    background: var(--kavi-yellow);
    color: var(--kavi-purple);
    border-radius: 999px;
    padding: 8px 10px;
    text-decoration: none;
    font-size: 12px;
    font-weight: 900;
  }

  .cart-summary {
    margin-top: 16px;
    border-top: 1px solid var(--line);
    padding-top: 14px;
  }

  .subtotal-row strong {
    color: var(--kavi-purple);
    font-size: 18px;
  }

  .delivery-box {
    margin-top: 14px;
    background: var(--kavi-purple-soft);
    border-radius: 14px;
    padding: 12px;
  }

  .delivery-box h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  .delivery-box p {
    margin: 0;
    color: #62586b;
    font-size: 13px;
  }

  .delivery-box .warning {
    margin-top: 7px;
    color: var(--kavi-purple);
    font-weight: 800;
  }

  .checkout-panel {
    margin-top: 14px;
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 12px;
    background: #fff;
  }

  .checkout-panel.compact {
    background: var(--kavi-purple-soft);
    border-color: #eadcf1;
  }

  .confirmation-gate {
    margin: 0 0 10px;
    color: var(--text);
    font-size: 13px;
    font-weight: 800;
  }

  .review-button,
  .confirm-button {
    width: 100%;
    border: none;
    border-radius: 999px;
    padding: 10px 12px;
    font-weight: 900;
    cursor: pointer;
  }

  .review-button {
    background: var(--kavi-yellow);
    color: var(--kavi-purple);
  }

  .confirm-button {
    margin-top: 10px;
    background: var(--kavi-purple);
    color: #fff;
  }

  .review-button:disabled,
  .confirm-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .checkout-draft {
    margin-top: 12px;
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }

  .checkout-draft h3 {
    margin: 0 0 8px;
    font-size: 14px;
  }

  .draft-lines p,
  .checkout-message,
  .checkout-error {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.4;
  }

  .draft-lines p {
    color: #62586b;
  }

  .checkout-message {
    color: var(--kavi-purple);
    font-weight: 800;
  }

  .details-status {
    margin: 9px 0 0;
    color: #62586b;
    font-size: 13px;
    font-weight: 800;
  }

  .checkout-details-form {
    margin-top: 10px;
    display: grid;
    gap: 9px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #fff;
    padding: 12px;
  }

  .checkout-details-form h4 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
  }

  .checkout-details-form p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.35;
  }

  .checkout-details-form label {
    display: grid;
    gap: 5px;
    color: #4a4053;
    font-size: 12px;
    font-weight: 800;
  }

  .checkout-details-form label span {
    color: var(--muted);
    font-weight: 700;
  }

  .checkout-details-form input,
  .checkout-details-form textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--text);
    background: #fff;
    padding: 9px 10px;
    font: inherit;
    font-size: 13px;
    resize: vertical;
  }

  .checkout-details-form input:focus,
  .checkout-details-form textarea:focus {
    outline: 2px solid rgba(75, 0, 125, 0.16);
    border-color: #cab5d8;
  }

  .delivery-validation {
    margin-top: 10px;
    background: #faf8fb;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px;
  }

  .delivery-validation strong {
    color: var(--kavi-purple);
    font-size: 13px;
  }

  .delivery-validation p {
    margin: 5px 0 0;
    color: #62586b;
    font-size: 12px;
    line-height: 1.35;
  }

  .next-date-row {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }

  .next-date-row button {
    justify-self: start;
    border: 1px solid #e2d3eb;
    background: #fff;
    color: var(--kavi-purple);
    border-radius: 999px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 900;
    cursor: pointer;
  }

  .delivery-correction-form {
    margin-top: 10px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: #fff;
    padding: 12px;
    display: grid;
    gap: 9px;
  }

  .delivery-correction-form h4 {
    margin: 0;
    color: var(--text);
    font-size: 14px;
  }

  .delivery-correction-form p {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.35;
  }

  .delivery-correction-form label {
    display: grid;
    gap: 5px;
    color: #4a4053;
    font-size: 12px;
    font-weight: 800;
  }

  .delivery-correction-form input {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: var(--text);
    background: #fff;
    padding: 9px 10px;
    font: inherit;
    font-size: 13px;
  }

  .delivery-correction-form input:focus {
    outline: 2px solid rgba(75, 0, 125, 0.16);
    border-color: #cab5d8;
  }

  .payment-link-box {
    margin-top: 10px;
    border-radius: 12px;
    background: var(--kavi-purple-soft);
    padding: 10px;
  }

  .payment-link-box a {
    color: var(--kavi-purple);
    font-weight: 900;
  }

  .payment-link-box p {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 12px;
  }

  .checkout-error {
    color: #9b1c1c;
    font-weight: 800;
  }

  .error-note {
    align-self: center;
    background: #fff7cc;
    color: #5b4600;
    border: 1px solid #f2dd79;
    border-radius: 14px;
    padding: 10px 12px;
    font-weight: 800;
  }

  @media (max-width: 820px) {
    .chat-column {
      padding: 20px 12px 26px;
    }

    .message.assistant {
      grid-template-columns: 28px minmax(0, 1fr);
    }

    .avatar {
      width: 28px;
      height: 28px;
      font-size: 12px;
    }

    .message.user .message-body {
      max-width: 92vw;
    }

    .pipeline.complete,
    .intent-panel,
    .products-section {
      margin-left: 38px;
    }

    .highlight-grid {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(220px, 76vw);
      grid-template-columns: none;
      overflow-x: auto;
      padding-bottom: 10px;
      scroll-snap-type: x proximity;
    }

    .more-rail {
      grid-auto-columns: minmax(200px, 70vw);
    }

    .cart-drawer {
      left: 10px;
      right: 10px;
      top: auto;
      bottom: 10px;
      width: auto;
      max-height: 82vh;
      border-radius: 22px 22px 18px 18px;
    }
  }

  @media (max-width: 560px) {
    .kavi-brand h1 {
      font-size: 16px;
    }

    .kavi-brand p {
      display: none;
    }

    .cart-button span:not(.cart-glyph) {
      display: none;
    }

    .composer-shell {
      padding: 9px 10px 12px;
    }

    .prompt-row {
      display: none;
    }

    .composer {
      border-radius: 18px;
    }

    .message.user {
      max-width: 100%;
    }

    .message-bubble {
      font-size: 14px;
    }
  }
`;
