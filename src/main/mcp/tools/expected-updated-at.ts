import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { errorResult, readOptionalString } from "./shared.js";

export const EXPECTED_UPDATED_AT_KEY = "expected_updated_at";

export const EXPECTED_UPDATED_AT_SCHEMA = {
  type: "string",
  description:
    "Optional. The updatedAt you last read (from get_page or a previous write). When given and the " +
    "record has been updated since, nothing is written and an error is returned, so you never " +
    "overwrite edits made in the meantime by the user or another agent.",
} as const;

export const readOptionalExpectedUpdatedAt = (
  args: Record<string, unknown>,
): string | undefined => readOptionalString(args, EXPECTED_UPDATED_AT_KEY);

export const isStaleUpdate = (expected: string | undefined, current: string): boolean =>
  expected !== undefined && expected !== current;

export const conflictResult = (current: string): CallToolResult =>
  errorResult(
    `Conflict: the record was updated at ${current}, after the expected_updated_at you sent. ` +
      "Nothing was written. Re-read it with get_page (or the matching get tool), " +
      "reapply your change to the latest content, and retry with the new updatedAt.",
  );
