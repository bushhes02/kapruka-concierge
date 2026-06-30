import { handleAgentRequest } from "@/lib/agent/router";

export async function POST(request: Request) {
  return handleAgentRequest(request);
}
