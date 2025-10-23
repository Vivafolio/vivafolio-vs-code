
export type ColumnType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "checkbox"
  | "person"
  | "relation"
  | "rollup"
  | "formula";

export interface ColumnDefCfg {
  id: string;
  title: string;
  path: string;
  type: ColumnType;
  width?: number;
  chipBlockType?: string;
  options?: { id: string; label: string; color?: string }[];
}

export interface TableConfig {
  collectionId: string;
  columns: ColumnDefCfg[];
  sort?: { path: string; dir: "asc" | "desc" }[];
  filters?: { path: string; op: string; value?: unknown }[];
  pageSize?: number;
}
