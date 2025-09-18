import { Component } from 'solid-js';
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
export interface BlockProps {
    graph: GraphService;
}
export type BlockComponent<T = {}> = Component<BlockProps & T>;
export declare function createBlock<T = {}>(component: BlockComponent<T>, options: {
    name: string;
    version?: string;
    description?: string;
}): BlockComponent<T>;
export declare function useEntity(graph: GraphService): import("solid-js").Accessor<Entity>;
export declare function useEntityUpdater(graph: GraphService): (updates: Partial<Entity["properties"]>) => void;
export declare function registerBlockElement(tagName: string, solidComponent: Component<any>, propsMapper?: (element: HTMLElement) => Record<string, unknown>): void;
