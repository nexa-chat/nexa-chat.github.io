/**
 * The tools a model may call in this chat: NEXA's own, which run in the browser, and those of
 * the MCP servers the user added. Each gets a name a provider accepts, and a way to run it.
 */

import { getVault } from "@/storage";
import type { McpServerConfig, Settings, ToolCall, ToolDefinition, ToolResult } from "@/types";
import { callTool, listTools, type McpTarget } from "../mcp";
import { CalculatorError, calculate } from "./calculator";

/** Providers accept tool names matching ^[a-zA-Z0-9_-]{1,64}$. */
function toolName(prefix: string, name: string): string {
  return `${prefix}__${name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function mcpPrefix(server: McpServerConfig): string {
  return server.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20) || "mcp";
}

export interface ToolEntry {
  definition: ToolDefinition;
  /** Shown to the user: where the tool runs. */
  source: string;
  /** NEXA's own tools run in the browser, touch nothing and need no permission. */
  needsApproval: boolean;
  run: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<{ text: string; isError: boolean }>;
}

const BUILT_IN: Record<string, Omit<ToolEntry, "definition"> & { definition: ToolDefinition }> = {
  time: {
    source: "NEXA, in your browser",
    needsApproval: false,
    definition: {
      name: "nexa__current_time",
      description: "The current date and time on the user's device, with its time zone.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    run: async () => {
      const now = new Date();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return { text: `${now.toISOString()} (local: ${now.toLocaleString()}, time zone: ${zone})`, isError: false };
    },
  },
  calculator: {
    source: "NEXA, in your browser",
    needsApproval: false,
    definition: {
      name: "nexa__calculator",
      description: "Evaluates an arithmetic expression exactly. Supports + - * / % ^, parentheses, sqrt, abs, round, floor, ceil, sin, cos, tan, log, ln, exp, min, max, pi and e.",
      inputSchema: { type: "object", properties: { expression: { type: "string", description: "For example (12.5 * 4) ^ 2 / sqrt(16)" } }, required: ["expression"], additionalProperties: false },
    },
    run: async (args) => {
      try {
        return { text: String(calculate(String(args.expression ?? ""))), isError: false };
      } catch (caught) {
        return { text: caught instanceof CalculatorError ? caught.message : "The expression couldn't be evaluated.", isError: true };
      }
    },
  },
};

export const BUILT_IN_TOOLS = [
  { id: "time", label: "Current date and time", description: "Lets the model know today's date and your time zone." },
  { id: "calculator", label: "Calculator", description: "Exact arithmetic, so numbers aren't guessed." },
] as const;

async function targetFor(server: McpServerConfig): Promise<McpTarget> {
  const secrets = server.hasAuth ? await getVault().get(`mcp_${server.id}`) : {};
  return { id: server.id, url: server.url, authorization: secrets.apiKey };
}

const listCache = new Map<string, { at: number; tools: ToolDefinition[] }>();
const LIST_TTL_MS = 5 * 60_000;

/** A server's tools, remembered for a few minutes so each message doesn't ask again. */
export async function serverTools(server: McpServerConfig, fresh = false): Promise<ToolDefinition[]> {
  const cached = listCache.get(server.id);
  if (!fresh && cached && Date.now() - cached.at < LIST_TTL_MS) return cached.tools;
  const tools = await listTools(await targetFor(server));
  listCache.set(server.id, { at: Date.now(), tools });
  return tools;
}

export interface Toolset {
  definitions: ToolDefinition[];
  find: (name: string) => ToolEntry | undefined;
  /** Servers that couldn't be reached this time, so the user can be told. */
  unavailable: string[];
}

export async function collectTools(settings: Pick<Settings, "toolsEnabled" | "builtinTools" | "mcpServers">): Promise<Toolset | undefined> {
  if (!settings.toolsEnabled) return undefined;
  const entries = new Map<string, ToolEntry>();
  for (const [id, tool] of Object.entries(BUILT_IN)) {
    if (settings.builtinTools[id] !== false) entries.set(tool.definition.name, tool);
  }

  const unavailable: string[] = [];
  await Promise.all(
    settings.mcpServers
      .filter((server) => server.enabled)
      .map(async (server) => {
        try {
          const tools = await serverTools(server);
          for (const tool of tools) {
            const name = toolName(mcpPrefix(server), tool.name);
            entries.set(name, {
              definition: { ...tool, name, description: tool.description || `${tool.name}, from ${server.name}` },
              source: server.name,
              needsApproval: true,
              run: async (args, signal) => callTool(await targetFor(server), tool.name, args, signal),
            });
          }
        } catch {
          unavailable.push(server.name);
        }
      }),
  );

  if (entries.size === 0) return undefined;
  return { definitions: [...entries.values()].map((entry) => entry.definition), find: (name) => entries.get(name), unavailable };
}

const MAX_RESULT_CHARACTERS = 16_000;

export function parseArguments(call: ToolCall): Record<string, unknown> | undefined {
  if (!call.arguments.trim()) return {};
  try {
    const value: unknown = JSON.parse(call.arguments);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Runs one call to completion and always returns a result, so the model hears what happened. */
export async function runToolCall(entry: ToolEntry | undefined, call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  if (!entry) return { toolCallId: call.id, content: `There is no tool named ${call.name}.`, isError: true };
  const args = parseArguments(call);
  if (!args) return { toolCallId: call.id, content: "The arguments weren't valid JSON.", isError: true };
  try {
    const { text, isError } = await entry.run(args, signal);
    const content = text.length > MAX_RESULT_CHARACTERS ? `${text.slice(0, MAX_RESULT_CHARACTERS)}\n[Cut at ${MAX_RESULT_CHARACTERS} characters.]` : text;
    return { toolCallId: call.id, content, isError };
  } catch (caught) {
    return { toolCallId: call.id, content: caught instanceof Error ? caught.message : "The tool failed.", isError: true };
  }
}
