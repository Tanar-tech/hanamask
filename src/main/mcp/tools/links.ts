import { createLink, deleteLink, listLinks, toEntityType } from "../../db/links-repo.js";
import { emitLinksChanged } from "../change-emitter.js";
import type { EntityType } from "../../../shared/preload-api.js";
import {
  ENTITY_TYPE_SCHEMA,
  errorResult,
  jsonResult,
  readString,
  toToolHandler,
  type McpTool,
} from "./shared.js";

const readEntityType = (args: Record<string, unknown>, key: string): EntityType =>
  toEntityType(args[key]);

const linkEntitiesTool: McpTool = {
  definition: {
    name: "link_entities",
    description: "Link two entities (notes, tasks and/or notebooks) to each other.",
    inputSchema: {
      type: "object",
      properties: {
        from_type: ENTITY_TYPE_SCHEMA,
        from_id: { type: "string", description: "Id of the entity the link starts from" },
        to_type: ENTITY_TYPE_SCHEMA,
        to_id: { type: "string", description: "Id of the entity the link points to" },
      },
      required: ["from_type", "from_id", "to_type", "to_id"],
    },
  },
  handler: toToolHandler((args) => {
    const link = createLink({
      fromType: readEntityType(args, "from_type"),
      fromId: readString(args, "from_id"),
      toType: readEntityType(args, "to_type"),
      toId: readString(args, "to_id"),
    });
    emitLinksChanged();
    return jsonResult({ link });
  }),
};

const unlinkEntitiesTool: McpTool = {
  definition: {
    name: "unlink_entities",
    description: "Delete a link by its id. The linked entities themselves are left untouched.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Link id (uuid)" },
      },
      required: ["id"],
    },
  },
  handler: toToolHandler((args) => {
    const id = readString(args, "id");
    if (!deleteLink(id)) {
      return errorResult(`Link not found: ${id}`);
    }
    emitLinksChanged();
    return jsonResult({ deleted: true });
  }),
};

const listLinksTool: McpTool = {
  definition: {
    name: "list_links",
    description: "List every link attached to an entity, whether it is the from or the to side.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: ENTITY_TYPE_SCHEMA,
        entity_id: { type: "string", description: "Id of the entity to list links for" },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  handler: toToolHandler((args) =>
    jsonResult({
      links: listLinks(readEntityType(args, "entity_type"), readString(args, "entity_id")),
    }),
  ),
};

export const linkTools: readonly McpTool[] = [linkEntitiesTool, unlinkEntitiesTool, listLinksTool];

export const findLinkTool = (name: string): McpTool | undefined =>
  linkTools.find((tool) => tool.definition.name === name);
