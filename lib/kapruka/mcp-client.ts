import "server-only";
import { normalizeKaprukaProducts, type KaprukaProduct } from "./product-normalizer";

const KAPRUKA_MCP_URL = "https://mcp.kapruka.com/mcp";

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type McpTool = {
  name: string;
  description?: string;
};

async function postMcp(payload: unknown, sessionId?: string) {
  const response = await fetch(KAPRUKA_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await response.text();
  const responseSessionId = response.headers.get("mcp-session-id") || sessionId;

  if (!response.ok) {
    throw new Error(`Kapruka MCP HTTP ${response.status}: ${text}`);
  }

  return {
    data: parseMcpResponse(text),
    sessionId: responseSessionId || undefined,
  };
}

function parseMcpResponse(text: string): JsonRpcResponse {
  const trimmed = text.trim();

  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    const dataLine = trimmed
      .split("\n")
      .find((line) => line.startsWith("data:"));

    if (!dataLine) {
      return {};
    }

    return JSON.parse(dataLine.replace(/^data:\s*/, "")) as JsonRpcResponse;
  }

  return JSON.parse(trimmed) as JsonRpcResponse;
}

function extractToolResultPayload(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }

  const resultRecord = result as Record<string, unknown>;

  if ("structuredContent" in resultRecord && resultRecord.structuredContent) {
    return resultRecord.structuredContent;
  }

  const content = resultRecord.content;

  if (Array.isArray(content)) {
    const firstTextContent = content.find((item) => {
      return (
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).type === "text" &&
        typeof (item as Record<string, unknown>).text === "string"
      );
    }) as Record<string, unknown> | undefined;

    const text = firstTextContent?.text;

    if (typeof text === "string") {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }

  return result;
}

async function initializeMcp() {
  const initializeResponse = await postMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "kavi-kapruka-concierge",
        version: "0.1.0",
      },
    },
  });

  if (initializeResponse.data.error) {
    throw new Error(initializeResponse.data.error.message || "MCP initialize failed.");
  }

  if (initializeResponse.sessionId) {
    await postMcp(
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      },
      initializeResponse.sessionId
    );
  }

  return initializeResponse.sessionId;
}

export async function searchKaprukaProducts(query: string): Promise<KaprukaProduct[]> {
  const sessionId = await initializeMcp();

  const searchResponse = await postMcp(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "kapruka_search_products",
        arguments: {
            params: {
              q: query,
              in_stock_only: true,
              limit: 20,
              currency: "LKR",
            },
          },
      },
    },
    sessionId
  );

  if (searchResponse.data.error) {
    throw new Error(
      searchResponse.data.error.message || "kapruka_search_products failed."
    );
  }

  const toolPayload = extractToolResultPayload(searchResponse.data.result);
  
  return normalizeKaprukaProducts(toolPayload);
}

export async function listKaprukaMcpTools(): Promise<McpTool[]> {
  const sessionId = await initializeMcp();

  const toolsResponse = await postMcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    },
    sessionId
  );

  if (toolsResponse.data.error) {
    throw new Error(toolsResponse.data.error.message || "Kapruka tools/list failed.");
  }

  const result = toolsResponse.data.result;

  if (!result || typeof result !== "object") {
    return [];
  }

  const tools = (result as Record<string, unknown>).tools;

  if (!Array.isArray(tools)) {
    return [];
  }

  return tools
    .map((tool): McpTool | null => {
      if (!tool || typeof tool !== "object") {
        return null;
      }

      const toolRecord = tool as Record<string, unknown>;

      if (typeof toolRecord.name !== "string") {
        return null;
      }

      return {
        name: toolRecord.name,
        description:
          typeof toolRecord.description === "string"
            ? toolRecord.description
            : undefined,
      };
    })
    .filter((tool): tool is McpTool => Boolean(tool));
}
