import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getNote, updateNote } from "../../db/notes-repo.js";
import {
  appendToMarkdown,
  replaceMarkdownSection,
  type SectionEditResult,
} from "../../markdown/sections.js";
import { emitNotesChanged } from "../change-emitter.js";
import {
  conflictResult,
  EXPECTED_UPDATED_AT_SCHEMA,
  isStaleUpdate,
  readOptionalExpectedUpdatedAt,
} from "./expected-updated-at.js";
import {
  errorResult,
  jsonResult,
  readOptionalString,
  readString,
  toToolHandler,
  type McpTool,
} from "./shared.js";

type BodyEdit = (body: string) => SectionEditResult;

const HEADING_DESCRIPTION =
  'Heading text, matched exactly after trimming (e.g. "Remaining"). Prefix with #s ' +
  '(e.g. "## Remaining") to also require that heading level. Headings inside code fences are ignored.';

const sectionFailureResult = (
  heading: string,
  failure: Extract<SectionEditResult, { ok: false }>,
): CallToolResult => {
  const list = failure.candidates.map((candidate) => `- ${candidate}`).join("\n");
  const problem =
    failure.reason === "ambiguous"
      ? `Heading "${heading}" matches more than one section. Nothing was written. ` +
        "Add #s to pin the level, or use update_page if the headings are identical. Matches:"
      : `Heading "${heading}" was not found. Nothing was written. Headings on the page:`;
  return errorResult(`${problem}\n${list}`);
};

// 書き換えは update_page と同じ updateNote を通す。履歴・更新日時・通知・索引の扱いを揃えるため。
const applyBodyEdit = (args: Record<string, unknown>, edit: BodyEdit): CallToolResult => {
  const id = readString(args, "id");
  const expectedUpdatedAt = readOptionalExpectedUpdatedAt(args);
  const existing = getNote(id);
  if (existing === null) return errorResult(`Note not found: ${id}`);
  if (isStaleUpdate(expectedUpdatedAt, existing.updatedAt)) {
    return conflictResult(existing.updatedAt);
  }
  const edited = edit(existing.body);
  if (!edited.ok) return sectionFailureResult(readOptionalString(args, "heading") ?? "", edited);
  const note = updateNote(id, { body: edited.markdown });
  if (note === null) return errorResult(`Note not found: ${id}`);
  emitNotesChanged({ entity: "note", action: "updated", id, title: note.title });
  return jsonResult({ note });
};

const appendToPageTool: McpTool = {
  definition: {
    name: "append_to_page",
    description:
      "Append Markdown to the end of a page, or to the end of one heading's section. " +
      "Prefer this over update_page when adding to a log or progress note: you send only the new " +
      "text, and edits made meanwhile elsewhere on the page are kept. Returns the updated page.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
        content: { type: "string", description: "Markdown to append" },
        heading: {
          type: "string",
          description: `${HEADING_DESCRIPTION} Omit to append to the end of the page.`,
        },
        expected_updated_at: EXPECTED_UPDATED_AT_SCHEMA,
      },
      required: ["id", "content"],
    },
  },
  handler: toToolHandler((args) => {
    const content = readString(args, "content");
    const heading = readOptionalString(args, "heading");
    return applyBodyEdit(args, (body) => appendToMarkdown(body, content, heading));
  }),
};

const replacePageSectionTool: McpTool = {
  definition: {
    name: "replace_page_section",
    description:
      "Replace the content of one heading's section (everything up to the next heading of the " +
      "same or higher level), keeping the heading line itself. Prefer this over update_page when " +
      "rewriting one part of a page, so the rest of the page is left untouched. If the heading " +
      "is missing or ambiguous nothing is written and the candidate headings are returned. " +
      "Returns the updated page.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Page id (uuid)" },
        heading: { type: "string", description: HEADING_DESCRIPTION },
        content: { type: "string", description: "New Markdown content for the section" },
        expected_updated_at: EXPECTED_UPDATED_AT_SCHEMA,
      },
      required: ["id", "heading", "content"],
    },
  },
  handler: toToolHandler((args) => {
    const heading = readString(args, "heading");
    const content = readString(args, "content");
    return applyBodyEdit(args, (body) => replaceMarkdownSection(body, heading, content));
  }),
};

export const pageEditTools: readonly McpTool[] = [appendToPageTool, replacePageSectionTool];
