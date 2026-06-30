# Kavi by Kapruka

Kavi by Kapruka is a Sri Lankan shopping concierge built with Next.js. It uses Gemini for multilingual intent understanding and natural replies, Kapruka MCP for real product/order data, and deterministic TypeScript for routing, filtering, cart, delivery, and checkout safety.

## Architecture

User message -> Gemini intent parser -> deterministic router -> Kapruka MCP -> product cards / cart / checkout

## LLM roles

- Gemini: multilingual intent extraction, natural assistant wording, gift message text
- Groq: fallback intent extraction only if Gemini fails
- TypeScript: validation, routing, grouping, cart, delivery, checkout safety
- Kapruka MCP: real products, delivery validation, order creation, order tracking

## Safety

- No fake products
- No fake prices
- No fake orders
- No fake payment links
- Checkout stays behind a confirmation gate
- Kapruka MCP calls stay server-side only
- Checkout PII is not sent to LLMs

## Local setup

```bash
npm install
```

Environment variables:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_key
GROQ_API_KEY=your_key_optional_if_fallback_used
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GEMINI_MODEL=gemini-2.5-flash
GROQ_MODEL=llama-3.1-8b-instant
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

## Demo flow

1. Search: `birthday cake for mum under 6000`
2. Search: `amma ta birthday cake ekak one 6000 aduwen`
3. Search: `appa ku chocolate hamper venum 8000 kulla`
4. Search: `flowers to Colombo tomorrow`
5. Add a product to cart
6. Generate a gift message
7. Review smart upsell options
8. Check delivery
9. Review checkout and confirm only after the gate is satisfied
10. Track an order reference

## Deployment notes

Set these environment variables in Vercel:

- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GROQ_API_KEY` if you want fallback intent parsing
- `NEXT_PUBLIC_SITE_URL`

## Project layout

- `app/api/agent/route.ts` - chat entrypoint
- `app/api/checkout/draft/route.ts` - deterministic checkout draft
- `app/api/checkout/confirm/route.ts` - explicit order confirmation path
- `app/api/gift-message/route.ts` - gift message generation
- `app/api/orders/track/route.ts` - order tracking
- `app/api/upsell/route.ts` - deterministic upsell search
- `lib/llm/intentParser.ts` - Gemini intent parser
- `lib/agent/router.ts` - deterministic intent router
- `lib/kapruka/mcp-client.ts` - Kapruka MCP client

