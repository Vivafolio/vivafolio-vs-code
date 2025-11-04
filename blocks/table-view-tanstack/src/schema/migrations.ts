
import type { ColumnDefCfg, TableConfig, ColumnType } from "./types";
import { coerceValue, getByPath, setByPath } from "./utils";

export interface GraphLike {
  readonly: boolean;
  aggregateEntities: (args: {
    collectionId: string;
    pageNumber: number;
    itemsPerPage: number;
    sort?: { path: string; dir: "asc" | "desc" }[];
    filters?: { path: string; op: string; value?: unknown }[];
  }) => Promise<{ items: any[]; pageNumber: number; itemsPerPage: number; pageCount: number; totalCount: number }>;
  updateEntity: (args: { entityId: string; properties: Record<string, unknown> }) => Promise<void>;
}

export async function migrateColumnType(
  graph: GraphLike,
  tableCfg: TableConfig,
  col: ColumnDefCfg,
  newType: ColumnType,
  newOptions?: ColumnDefCfg["options"],
  progress?: (info: { processed: number; total: number }) => void,
) {
  let page = 1;
  const pageSize = 200;
  let processed = 0;

  while (true) {
    const res = await graph.aggregateEntities({
      collectionId: tableCfg.collectionId,
      pageNumber: page,
      itemsPerPage: pageSize,
    });

    for (const row of res.items) {
      const props = row.properties ?? {};
      const current = getByPath(props, col.path);
      const coerced = coerceValue(newType, current, newOptions);

      if (newType === "formula" || newType === "rollup") continue;
      if (coerced === current) { processed++; continue; }

      const nextProps = setByPath(props, col.path, coerced);
      await graph.updateEntity({ entityId: row.entityId, properties: nextProps });
      processed++;
      progress?.({ processed, total: res.totalCount });
    }

    if (page >= res.pageCount) break;
    page++;
  }
}
