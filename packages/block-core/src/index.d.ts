export type { Entity as BP_Entity, QueryEntitiesData as BP_QueryEntitiesData, QueryEntitiesResult as BP_QueryEntitiesResult, UpdateEntityData as BP_UpdateEntityData, DeleteEntityData as BP_DeleteEntityData, MultiFilter as BP_MultiFilter, MultiSort as BP_MultiSort, Sort as BP_Sort, } from "@blockprotocol/graph";
export interface Entity {
    entityId: string;
    entityTypeId: string;
    properties: Record<string, unknown>;
    metadata?: {
        recordId: {
            entityId: string;
            editionId: string;
        };
        entityTypeId: string;
    };
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
export declare const getByPath: (obj: any, path: string) => any;
export declare const setByPath: (obj: any, path: string, value: unknown) => any;
