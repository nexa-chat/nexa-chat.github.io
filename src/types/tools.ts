/** Tool primitives shared by adapters, the tool loop and MCP. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema describing the tool input. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text as emitted by the model. It may be incomplete on an interrupted stream. */
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/** An MCP server reached over Streamable HTTP. Its Authorization value, if any, is in the vault. */
export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  hasAuth: boolean;
}
