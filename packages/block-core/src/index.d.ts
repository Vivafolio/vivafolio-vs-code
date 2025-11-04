export type { Entity as BP_Entity, QueryEntitiesData as BP_QueryEntitiesData, QueryEntitiesResult as BP_QueryEntitiesResult, UpdateEntityData as BP_UpdateEntityData, DeleteEntityData as BP_DeleteEntityData, MultiFilter as BP_MultiFilter, MultiSort as BP_MultiSort, Sort as BP_Sort, } from "@blockprotocol/graph";
export interface Entity {
    entityId: string;
    properties: Record<string, unknown>;
    entityTypeId?: string;
    metadata?: {
        recordId: {
            entityId: string;
            editionId: string;
        };
        entityTypeId: string;
    };
}
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
export type FilterSpec = {
    path: string;
    op: "equals" | "not_equals" | "contains" | "starts_with" | "ends_with" | "greater_than" | "less_than" | "is_empty" | "is_not_empty";
    value?: unknown;
};
export type SortSpec = {
    path: string;
    dir: "asc" | "desc";
};
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
export type BlockResource = {
    logicalName: string;
    physicalPath: string;
    cachingTag?: string;
};
export type Range = {
    start: {
        line: number;
        character: number;
    };
    end: {
        line: number;
        character: number;
    };
};
export type VivafolioBlockNotification = {
    blockId: string;
    blockType: string;
    sourceUri?: string;
    range?: Range;
    entityId?: string;
    displayMode: "multi-line" | "inline";
    entityGraph: EntityGraph;
    resources?: BlockResource[];
    supportsHotReload?: boolean;
    initialHeight?: number;
};
export declare const getByPath: (obj: any, path: string) => any;
export declare const setByPath: (obj: any, path: string, value: unknown) => any;
