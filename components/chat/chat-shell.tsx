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

type SearchResponse = {
  query: string;
  products: Product[];
  groups: ProductGroup[];
  error?: string;
};

const samplePrompts = [
  "birthday gift",
  "anniversary flowers",
  "chocolate hamper",
];

export function ChatShell() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [cart, setCart] = useState<Product[]>([]);

  const cartIds = useMemo(() => new Set(cart.map((item) => item.id)), [cart]);

  async function runSearch(searchQuery: string) {
    const cleanQuery = searchQuery.trim();

    if (!cleanQuery) {
      setError("Type a gift idea first.");
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/kapruka/search", {
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

      setResults(data);
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Product search failed."
      );
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
        padding: "32px 24px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          minHeight: "calc(100vh - 64px)",
          margin: "0 auto",
          borderRadius: "32px",
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
            padding: "24px 32px",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#FFD400",
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            Kapruka AI
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: "clamp(28px, 5vw, 44px)",
              lineHeight: 1.1,
            }}
          >
            Rani — Kapruka AI Gift Concierge
          </h1>
        </header>

        <section style={{ padding: "40px 32px" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                margin: "0 auto 24px",
                borderRadius: "999px",
                background: "#FFD400",
                color: "#4B007D",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "36px",
                fontWeight: 900,
                boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
              }}
            >
              R
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "clamp(34px, 6vw, 56px)",
                lineHeight: 1,
              }}
            >
              Find real Kapruka gifts
            </h2>

            <p
              style={{
                margin: "18px auto 0",
                color: "rgba(255,255,255,0.86)",
                fontSize: "17px",
                lineHeight: 1.7,
              }}
            >
              Search Kapruka products using the server-side MCP connection. Rani
              groups results deterministically into Best Match, Best Value, and
              Premium Pick.
            </p>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch(query);
              }}
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "28px",
                flexWrap: "wrap",
              }}
            >
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for flowers, cake, hampers..."
                style={{
                  flex: "1 1 280px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.24)",
                  background: "rgba(255,255,255,0.96)",
                  color: "#2D003F",
                  padding: "15px 18px",
                  fontSize: "16px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={isSearching}
                style={{
                  borderRadius: "999px",
                  border: "none",
                  background: "#FFD400",
                  color: "#4B007D",
                  padding: "15px 24px",
                  fontSize: "16px",
                  fontWeight: 800,
                  cursor: isSearching ? "wait" : "pointer",
                }}
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginTop: "16px",
              }}
            >
              {samplePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isSearching}
                  onClick={() => {
                    setQuery(prompt);
                    void runSearch(prompt);
                  }}
                  style={{
                    borderRadius: "999px",
                    border: "1px solid rgba(255,212,0,0.65)",
                    background: "rgba(255,212,0,0.18)",
                    color: "white",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: isSearching ? "wait" : "pointer",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {error ? (
              <p
                style={{
                  marginTop: "18px",
                  color: "#FFD400",
                  fontWeight: 700,
                }}
              >
                {error}
              </p>
            ) : null}
          </div>

          {results ? (
            <div style={{ marginTop: "40px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                  marginBottom: "18px",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "24px" }}>
                  Results for “{results.query}”
                </h3>
                <div
                  style={{
                    borderRadius: "999px",
                    border: "1px solid rgba(255,212,0,0.55)",
                    padding: "10px 14px",
                    color: "#FFD400",
                    fontWeight: 800,
                  }}
                >
                  Cart: {cart.length}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "16px",
                }}
              >
                {results.groups.map((group) =>
                  group.product ? (
                    <ProductCard
                      key={`${group.label}-${group.product.id}`}
                      product={group.product}
                      label={group.label}
                      reason={group.reason}
                      isInCart={cartIds.has(group.product.id)}
                      onAdd={() => addToCart(group.product as Product)}
                      onRemove={() => removeFromCart(group.product?.id || "")}
                    />
                  ) : null
                )}
              </div>

              {results.products.length > 0 ? (
                <>
                  <h3 style={{ margin: "34px 0 18px", fontSize: "22px" }}>
                    More products
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {results.products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isInCart={cartIds.has(product.id)}
                        onAdd={() => addToCart(product)}
                        onRemove={() => removeFromCart(product.id)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: "rgba(255,255,255,0.8)" }}>
                  No products were returned for this search.
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ProductCard({
  product,
  label,
  reason,
  isInCart,
  onAdd,
  onRemove,
}: {
  product: Product;
  label?: string;
  reason?: string;
  isInCart: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <article
      style={{
        borderRadius: "24px",
        border: label
          ? "1px solid rgba(255,212,0,0.72)"
          : "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.12)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {label ? (
        <div
          style={{
            alignSelf: "flex-start",
            borderRadius: "999px",
            background: "#FFD400",
            color: "#4B007D",
            padding: "6px 10px",
            fontSize: "12px",
            fontWeight: 900,
          }}
        >
          {label}
        </div>
      ) : null}

      <div
        style={{
          borderRadius: "18px",
          background: "rgba(255,255,255,0.9)",
          minHeight: "160px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{ width: "100%", height: "180px", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "#4B007D", fontWeight: 800 }}>No image</span>
        )}
      </div>

      <div>
        <h4 style={{ margin: 0, fontSize: "17px", lineHeight: 1.35 }}>
          {product.url ? (
            <a href={product.url} target="_blank" rel="noreferrer" style={{ color: "white" }}>
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
        {reason ? (
          <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,0.78)", fontSize: "13px" }}>
            {reason}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={isInCart ? onRemove : onAdd}
        style={{
          marginTop: "auto",
          borderRadius: "999px",
          border: "none",
          background: isInCart ? "rgba(255,255,255,0.92)" : "#FFD400",
          color: "#4B007D",
          padding: "12px 16px",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        {isInCart ? "Remove from Cart" : "Add to Cart"}
      </button>
    </article>
  );
}
