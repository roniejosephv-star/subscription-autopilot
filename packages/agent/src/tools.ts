/**
 * LLM planning layer (Day 3, optional — deterministic mode in index.ts is the fallback).
 * Claude gets tools that can only reach SpendGuard, never a key: the trust boundary
 * holds even if the model is prompt-injected — that's demo beat 3.
 */
import Anthropic from "@anthropic-ai/sdk";
import { pay } from "./signer-client.js";
import { getQuotes } from "./reshop.js";
import * as subs from "./subscriptions.js";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_quotes",
    description: "Get current per-call price quotes from all fx-rates sellers for an expected monthly call volume.",
    input_schema: {
      type: "object",
      properties: { expectedCalls: { type: "number" } },
      required: ["expectedCalls"],
    },
  },
  {
    name: "pay_service",
    description: "Request a policy-governed x402 payment to a service URL via SpendGuard. May be denied or held for human approval.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" }, serviceId: { type: "string" },
        sellerId: { type: "string" }, reason: { type: "string" },
      },
      required: ["url", "serviceId", "sellerId", "reason"],
    },
  },
  {
    name: "list_subscriptions",
    description: "List current subscriptions with usage and renewal dates.",
    input_schema: { type: "object", properties: {} },
  },
];

async function runTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_quotes":
      return JSON.stringify(await getQuotes(Number(input.expectedCalls ?? 0)));
    case "pay_service":
      return JSON.stringify(await pay(String(input.url), String(input.serviceId), String(input.sellerId), String(input.reason)));
    case "list_subscriptions":
      return JSON.stringify(subs.load());
    default:
      return JSON.stringify({ error: `unknown tool ${name}` });
  }
}

export async function planWithClaude(task: string): Promise<string> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  for (let turn = 0; turn < 8; turn++) {
    const response = await client.messages.create({
      model: process.env.AGENT_MODEL ?? "claude-sonnet-5",
      max_tokens: 1024,
      system:
        "You are Subscription Autopilot, managing recurring x402 API spending for your owner. " +
        "Minimize cost, stay within policy, and explain decisions briefly. " +
        "If a payment is denied by SpendGuard, respect the denial and re-plan — never retry the same amount.",
      tools: TOOLS,
      messages,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      return response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: await runTool(tu.name, tu.input as Record<string, unknown>),
      });
    }
    messages.push({ role: "user", content: results });
  }
  return "planning loop exhausted";
}
