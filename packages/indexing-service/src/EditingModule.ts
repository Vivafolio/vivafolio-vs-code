// Base interface for all editing modules
export interface EditingModule {
  canHandle(sourceType: string, metadata: any): boolean;
  updateEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean>;
  createEntity(entityId: string, properties: Record<string, any>, metadata: any): Promise<boolean>;
  deleteEntity(entityId: string, metadata: any): Promise<boolean>;
}

// DSL Module interface for source code constructs
export interface DSLModule {
  version: string;
  entityId: string;
  operations: {
    updateEntity: {
      handler: string;
      params: Record<string, any>;
    };
    createEntity: {
      handler: string;
      params: Record<string, any>;
    };
    deleteEntity: {
      handler: string;
      params: Record<string, any>;
    };
  };
  source: {
    type: string;
    pattern: string;
  };
}

// Result of an editing operation
export interface EditResult {
  success: boolean;
  error?: string;
  affectedFiles?: string[];
}

// Context for editing operations
export interface EditContext {
  entityId: string;
  sourcePath: string;
  sourceType: string;
  metadata: any;
  dslModule?: DSLModule;
}
