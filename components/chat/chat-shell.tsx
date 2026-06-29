"use client";

import { useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number | null;
  priceText: string;
  imageUrl: string | null;
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

type SearchResponse = {
  intent: ShoppingIntent;
  assistantMessage: string;
  products: Product[];
  groups: ProductGroup[];
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: SearchResponse;
};

const samplePrompts = [
  "I need a birthday cake under 6000 for my mum",
  "Send anniversary flowers to Colombo tomorrow",
  "Chocolate hamper for my dad under 8000",
];

export function ChatShell() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I am Kavi by Kapruka. Tell me who you are shopping for, the occasion, and your budget.",
    },
  ]);
  const [cart, setCart] = useState<Product[]>([]);

  const cartIds = useMemo(() => new Set(cart.map((item) => item.id)), [cart]);

  async function sendMessage(messageText: string) {
    const cleanQuery = messageText.trim();

    if (!cleanQuery) {
      setError("Type a shopping request first.");
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanQuery,
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setQuery("");
    setIsSearching(true);
    setError(null);

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

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.assistantMessage,
        result: data,
      };

      setMessages((currentMessages) => [...currentMessages, assistantMessage]);
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
          content: message,
        },
      ]);
    } finally {
      setIsSearching(false);
    }
  }

  function addToCart(product: Product) {
    setCart((currentCart) => {
      if (currentCart.some((item) => item.id === product.id)) {
        return currentCart;
      }

      return [...currentCart, product];
    });
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) =>
      currentCart.filter((product) => product.id !== productId)
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#4B007D",
        color: "white",
        padding: "24px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1040px",
          minHeight: "calc(100vh - 48px)",
          margin: "0 auto",
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.1)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.18)",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "46px",
                height: "46px",
                borderRadius: "50%",
                background: "#FFD400",
                color: "#4B007D",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                fontWeight: 900,
              }}
            >
              K
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  color: "#FFD400",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                Kapruka Concierge
              </p>
              <h1 style={{ margin: "4px 0 0", fontSize: "28px", lineHeight: 1.1 }}>
                Kavi by Kapruka
              </h1>
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,212,0,0.55)",
              padding: "10px 14px",
              color: "#FFD400",
              fontWeight: 900,
            }}
          >
            Cart: {cart.length}
          </div>
        </header>

        <section
          style={{
            flex: 1,
            padding: "24px",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                cartIds={cartIds}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            ))}

            {isSearching ? (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "76%",
                    background: "rgba(255,255,255,0.16)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    padding: "14px 16px",
                  }}
                >
                  Kavi is checking Kapruka products...
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <footer
          style={{
            borderTop: "1px solid rgba(255,255,255,0.18)",
            padding: "18px 24px 22px",
            background: "rgba(45,0,63,0.36)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            {samplePrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isSearching}
                onClick={() => void sendMessage(prompt)}
                style={{
                  border: "1px solid rgba(255,212,0,0.65)",
                  background: "rgba(255,212,0,0.18)",
                  color: "white",
                  padding: "9px 12px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: isSearching ? "wait" : "pointer",
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(query);
            }}
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="I need a birthday cake under 6000 for my mum"
              style={{
                flex: "1 1 280px",
                border: "1px solid rgba(255,255,255,0.24)",
                background: "rgba(255,255,255,0.96)",
                color: "#2D003F",
                padding: "15px 16px",
                fontSize: "16px",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={isSearching}
              style={{
                border: "none",
                background: "#FFD400",
                color: "#4B007D",
                padding: "15px 22px",
                fontSize: "16px",
                fontWeight: 900,
                cursor: isSearching ? "wait" : "pointer",
              }}
            >
              {isSearching ? "Sending..." : "Send"}
            </button>
          </form>

          {error ? (
            <p style={{ margin: "12px 0 0", color: "#FFD400", fontWeight: 700 }}>
              {error}
            </p>
          ) : null}
        </footer>
      </div>
    </main>
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
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          width: message.result ? "100%" : "auto",
          maxWidth: message.result ? "100%" : "76%",
        }}
      >
        <div
          style={{
            marginLeft: isUser ? "auto" : 0,
            maxWidth: message.result ? "720px" : "100%",
            background: isUser ? "#FFD400" : "rgba(255,255,255,0.16)",
            color: isUser ? "#4B007D" : "white",
            border: isUser
              ? "1px solid #FFD400"
              : "1px solid rgba(255,255,255,0.16)",
            padding: "14px 16px",
            fontSize: "15px",
            lineHeight: 1.55,
            fontWeight: isUser ? 800 : 500,
          }}
        >
          {message.content}
        </div>

        {message.result ? (
          <div style={{ marginTop: "14px" }}>
            <IntentSummary intent={message.result.intent} />
            <div
              style={{
                marginTop: "14px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: "14px",
              }}
            >
              {message.result.groups.map((group) =>
                group.product ? (
                  <ProductCard
                    key={`${group.label}-${group.product.id}`}
                    product={group.product}
                    label={group.label}
                    isInCart={cartIds.has(group.product.id)}
                    onAdd={() => onAdd(group.product as Product)}
                    onRemove={() => onRemove(group.product?.id || "")}
                  />
                ) : null
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IntentSummary({ intent }: { intent: ShoppingIntent }) {
  const items = [
    ["Search", intent.searchQuery],
    ["Category", intent.category],
    ["Occasion", intent.occasion],
    ["Recipient", intent.recipient],
    ["Budget", formatBudget(intent)],
    ["City", intent.city],
  ].filter(([, value]) => value);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: "1px solid rgba(255,212,0,0.45)",
        background: "rgba(255,212,0,0.12)",
        padding: "12px",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {items.map(([label, value]) => (
          <span
            key={label}
            style={{
              background: "rgba(255,255,255,0.92)",
              color: "#4B007D",
              padding: "7px 10px",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            {label}: {value}
          </span>
        ))}
      </div>
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

function ProductCard({
  product,
  label,
  isInCart,
  onAdd,
  onRemove,
}: {
  product: Product;
  label: string;
  isInCart: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <article
      style={{
        border: "1px solid rgba(255,212,0,0.72)",
        background: "rgba(255,255,255,0.12)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div
        style={{
          alignSelf: "flex-start",
          background: "#FFD400",
          color: "#4B007D",
          padding: "6px 10px",
          fontSize: "12px",
          fontWeight: 900,
        }}
      >
        {label}
      </div>

      <div>
        <h4 style={{ margin: 0, fontSize: "16px", lineHeight: 1.35 }}>
          {product.url ? (
            <a
              href={product.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "white" }}
            >
              {product.name}
            </a>
          ) : (
            product.name
          )}
        </h4>
        <p style={{ margin: "8px 0 0", color: "#FFD400", fontWeight: 900 }}>
          {product.priceText}
        </p>
        {product.stockStatus ? (
          <p style={{ margin: "6px 0 0", color: "rgba(255,255,255,0.78)" }}>
            {product.stockStatus}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={isInCart ? onRemove : onAdd}
        style={{
          marginTop: "auto",
          border: "none",
          background: isInCart ? "rgba(255,255,255,0.92)" : "#FFD400",
          color: "#4B007D",
          padding: "12px 14px",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        {isInCart ? "Remove from Cart" : "Add to Cart"}
      </button>
    </article>
  );
}
