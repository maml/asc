import { AscError, AscTimeoutError } from "@asc-so/client";

interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function formatResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function formatError(err: unknown): McpToolResult {
  if (err instanceof AscTimeoutError) {
    return {
      content: [
        {
          type: "text",
          text: `Timeout: ${err.message}\nYou can check the result later using the task ID.`,
        },
      ],
      isError: true,
    };
  }

  if (err instanceof AscError) {
    return {
      content: [
        {
          type: "text",
          text: `Error [${err.code}]: ${err.message}${err.retryable ? " (retryable)" : ""}`,
        },
      ],
      isError: true,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
