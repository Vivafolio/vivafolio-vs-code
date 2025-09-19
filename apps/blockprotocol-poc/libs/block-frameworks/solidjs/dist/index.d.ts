import { Component, JSX } from 'solid-js';
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
export declare class BlockElement {
    graph: GraphService;
    constructor(graph: GraphService);
    get entity(): Entity;
    get readonly(): boolean;
    updateEntity(updates: Partial<Entity['properties']>): void;
}
export declare function createBlock<T = {}>(component: BlockComponent<T>, options: {
    name: string;
    version?: string;
    description?: string;
}): {
    (props: BlockProps & T): JSX.Element;
    blockMetadata: typeof options;
};
export declare function useEntity(graph: GraphService): import("solid-js").Accessor<Entity>;
export declare function useEntityUpdater(graph: GraphService): (updates: Partial<Entity["properties"]>) => void;
export declare const blockStyles = "\n  .solidjs-block-container {\n    display: block;\n    border: 2px solid #8b5cf6;\n    border-radius: 8px;\n    padding: 1rem;\n    background: rgba(139, 92, 246, 0.08);\n    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  }\n\n  .solidjs-block-heading {\n    margin: 0 0 0.5rem 0;\n    font-size: 1.1rem;\n    color: #5b21b6;\n  }\n\n  .solidjs-block-body {\n    display: flex;\n    flex-direction: column;\n    gap: 0.5rem;\n  }\n\n  .solidjs-block-field {\n    display: flex;\n    flex-direction: column;\n    font-size: 0.9rem;\n    color: #374151;\n  }\n\n  .solidjs-block-field__label {\n    margin-bottom: 0.25rem;\n    font-weight: 600;\n  }\n\n  .solidjs-block-input,\n  .solidjs-block-select {\n    padding: 0.4rem 0.5rem;\n    border: 1px solid #ddd6fe;\n    border-radius: 4px;\n    font-size: 0.95rem;\n    background: white;\n  }\n\n  .solidjs-block-input:disabled,\n  .solidjs-block-select:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n  }\n\n  .solidjs-block-button {\n    align-self: flex-start;\n    padding: 0.4rem 0.8rem;\n    border-radius: 4px;\n    border: none;\n    background: #8b5cf6;\n    color: white;\n    font-weight: 600;\n    cursor: pointer;\n  }\n\n  .solidjs-block-button:disabled {\n    opacity: 0.5;\n    cursor: not-allowed;\n  }\n\n  .solidjs-block-button:hover:not(:disabled) {\n    background: #7c3aed;\n  }\n\n  .solidjs-block-footnote {\n    font-size: 0.8rem;\n    color: #5b21b6;\n    margin-top: 0.5rem;\n  }\n";
export declare const BlockContainer: Component<{
    className?: string;
    children: any;
}>;
export declare const BlockField: Component<{
    label: string;
    children: any;
}>;
export declare const BlockInput: Component<{
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    type?: 'text' | 'email' | 'url' | 'number';
}>;
export declare const BlockSelect: Component<{
    value: string;
    options: Array<{
        value: string;
        label: string;
    }>;
    onChange: (value: string) => void;
    disabled?: boolean;
}>;
export declare const BlockButton: Component<{
    onClick: () => void;
    children: any;
    disabled?: boolean;
}>;
export declare function createBlockElement(component: Component<BlockProps>, options: {
    name: string;
    version?: string;
    description?: string;
}): {
    element: typeof HTMLElement;
    init: (params: {
        element: HTMLElement;
        entity: Entity;
        readonly: boolean;
        updateEntity: (updates: Partial<Entity['properties']>) => void;
    }) => void;
    updateEntity: (params: {
        element: HTMLElement;
        entity: Entity;
        readonly: boolean;
    }) => void;
};
export declare function registerBlockElement(tagName: string, solidComponent: Component<any>, propsMapper?: (element: HTMLElement) => Record<string, unknown>): void;
