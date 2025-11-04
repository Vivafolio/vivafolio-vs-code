// @vivafolio/block-core
// Single entry for shared types, utils, and message shapes to avoid drift.

// 1) Re-export stable subsets from Block Protocol to avoid schema drift
export type {
  Entity as BP_Entity,
  QueryEntitiesData as BP_QueryEntitiesData,
  QueryEntitiesResult as BP_QueryEntitiesResult,
  UpdateEntityData as BP_UpdateEntityData,
  DeleteEntityData as BP_DeleteEntityData,
  MultiFilter as BP_MultiFilter,
  MultiSort as BP_MultiSort,
  Sort as BP_Sort,
} from "@blockprotocol/graph";

// 2) Minimal internal core types for block frameworks
export interface Entity {
  entityId: string;
  properties: Record<string, unknown>;
  // Optional for lightweight entities used in client/loader payloads
  entityTypeId?: string;
  metadata?: {
    recordId: { entityId: string; editionId: string };
    entityTypeId: string;
  };
}

// LinkEntity used by apps that model explicit edges between entities
export interface LinkEntity extends Entity {
  sourceEntityId?: string;
  destinationEntityId?: string;
}

export interface EntityGraph {
  entities: Entity[];
  links: LinkEntity[];
}

export interface BlockGraph {
  depth: number;
  linkedEntities: Entity[];
  linkGroups: Array<Record<string, unknown>>;
}

export interface GraphService {
  blockEntity: Entity;
  blockGraph: BlockGraph;
  entityTypes: Array<Record<string, unknown>>;
  linkedAggregations: Array<Record<string, unknown>>;
  readonly: boolean;
}

export interface BlockProps<TGraph = GraphService> {
  graph: TGraph;
}

// 3) Messages / shapes used by blocks (lightweight, framework-agnostic)
export type FilterSpec = {
  path: string; // dot-path into properties
  op:
    | "equals"
    | "not_equals"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value?: unknown;
};

export type SortSpec = { path: string; dir: "asc" | "desc" };

export type AggregateArgs = {
  collectionId: string;
  pageNumber: number;
  itemsPerPage: number;
  sort?: SortSpec[];
  filters?: FilterSpec[];
};

export type AggregateResult<T = any> = {
  items: T[];
  pageNumber: number;
  itemsPerPage: number;
  pageCount: number;
  totalCount: number;
};

// 4) Webview / Loader Notifications shared across server, client, loader
export type BlockResource = {
  logicalName: string;
  physicalPath: string;
  cachingTag?: string;
};

export type Range = {
  start: { line: number; character: number };
  end: { line: number; character: number };
};

export type VivafolioBlockNotification = {
  blockId: string;
  blockType: string;
  // Optional, used when originating from a source file / LSP event
  sourceUri?: string;
  range?: Range;
  // Data binding
  entityId?: string;
  displayMode: "multi-line" | "inline";
  entityGraph: EntityGraph;
  // Resources are optional (server often sends them; client may have cache)
  resources?: BlockResource[];
  // Runtime hints
  supportsHotReload?: boolean;
  initialHeight?: number;
};

// 5) Utils (kept tiny; framework-agnostic)
export const getByPath = (obj: any, path: string): any =>
  path.split(".").reduce((cur, k) => (cur == null ? cur : cur[k]), obj);

export const setByPath = (obj: any, path: string, value: unknown): any => {
  const parts = path.split(".");
  const target = { ...(obj || {}) } as any;
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    cur[key] = typeof cur[key] === "object" && cur[key] != null ? { ...cur[key] } : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return target;
};
