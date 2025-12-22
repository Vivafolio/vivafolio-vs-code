
import type { Component } from "solid-js";
import { createSignal, createMemo, For, Show, onMount } from "solid-js";
import { createSolidTable, getCoreRowModel, type ColumnDef } from "@tanstack/solid-table";
import { createVirtualizer } from "@tanstack/solid-virtual";
import { useEntity, type Entity, type GraphService } from "@vivafolio/block-solidjs";
import type { TableConfig, ColumnDefCfg, ColumnType } from "./schema/types";
import { getByPath, setByPath } from "./schema/utils";
import { ColumnHeaderMenu } from "./schema/editor";

// Extended GraphService interface for table view with server-side pagination
export interface TableViewGraphService extends GraphService {
  // Server-side pagination and querying
  aggregateEntities: (args: {
    collectionId: string;
    pageNumber: number;
    itemsPerPage: number;
    sort?: { path: string; dir: "asc" | "desc" }[];
    filters?: { path: string; op: string; value?: unknown }[];
  }) => Promise<{ 
    items: any[]; 
    pageNumber: number; 
    itemsPerPage: number; 
    pageCount: number; 
    totalCount: number 
  }>;
  // Entity mutation
  updateEntity: (
    entityId: string,
    properties: Record<string, unknown>,
  ) => Promise<boolean>;
}

export interface TableViewProps { 
  graph: TableViewGraphService;
}

function emitHook(node: HTMLElement, payload: any) {
  node.dispatchEvent(new CustomEvent("blockprotocol:hook", { detail: payload, bubbles: true, composed: true }));
}

const TableView: Component<TableViewProps> = (props) => {
  const rootEntity = useEntity<TableViewGraphService>(props.graph);
  const cfg = () => (rootEntity()?.properties ?? {}) as unknown as TableConfig;

  const [pageNumber, setPage] = createSignal(1);
  const pageSize = () => Math.max(10, Math.min(500, cfg().pageSize ?? 50));
  const [rows, setRows] = createSignal<any[]>([]);
  const [pageCount, setPageCount] = createSignal(1);
  const [totalCount, setTotal] = createSignal(0);
  const [loading, setLoading] = createSignal(false);

  async function setCfg(next: TableConfig) {
    await props.graph.updateEntity(rootEntity()?.entityId!, next as any);
    await loadPage();
  }

  const loadPage = async () => {
    setLoading(true);
    const res = await props.graph.aggregateEntities({
      collectionId: cfg().collectionId,
      pageNumber: pageNumber(),
      itemsPerPage: pageSize(),
      sort: cfg().sort, filters: cfg().filters,
    });
    setRows(res.items);
    setPageCount(res.pageCount);
    setTotal(res.totalCount);
    setLoading(false);
  };

  onMount(loadPage);

  const columns = createMemo<ColumnDef<any>[]>(() =>
    (cfg().columns ?? []).map((col: any) => ({
      id: col.id,
      header: () => (
        <div class="th-inner">
          <span class="title">{col.title}</span>
          <ColumnHeaderMenu graph={props.graph} cfg={cfg} setCfg={setCfg} col={col as ColumnDefCfg} />
        </div>
      ),
      size: col.width ?? 200,
      cell: (ctx) => {
        const row = ctx.row.original;
        const value = getByPath(row.properties ?? row, col.path);

        if (col.chipBlockType) {
          let slot!: HTMLDivElement;
          onMount(() => {
            if (!slot) return;
            emitHook(slot, {
              type: "vivafolio:embed:entity",
              node: slot,
              entityId: row.entityId,
              chip: { service: col.chipBlockType, propertyPath: col.path },
            });
          });
          return <div class="cell-chip" ref={slot} />;
        }

        return (
          <PrimitiveEditor
            readonly={props.graph.readonly}
            type={col.type}
            value={value}
            onCommit={async (newVal) => {
              await props.graph.updateEntity(
                row.entityId,
                setByPath(row.properties ?? {}, col.path, newVal),
              );
            }}
          />
        );
      },
    }))
  );

  const table = createSolidTable({
    get data() { return rows(); },
    columns: columns(),
    getCoreRowModel: getCoreRowModel(),
  });

  let scrollParent!: HTMLDivElement;
  const rowVirtualizer = createVirtualizer({
    get count() { return rows().length; },
    getScrollElement: () => scrollParent,
    estimateSize: () => 36,
    overscan: 8,
  });

  const canPrev = () => pageNumber() > 1;
  const canNext = () => pageNumber() < pageCount();
  const goto = async (p: number) => { setPage(p); await loadPage(); scrollParent?.scrollTo({ top: 0 }); };

  return (
    <div class="vf-table-view" role="grid" aria-rowcount={totalCount()} aria-colcount={(cfg().columns ?? []).length}>
      <div class="toolbar" role="toolbar">
        <button class="btn" disabled={!canPrev()} onClick={() => goto(pageNumber() - 1)} aria-label="Previous page">‹</button>
        <span class="pg">Page {pageNumber()} / {pageCount()}</span>
        <button class="btn" disabled={!canNext()} onClick={() => goto(pageNumber() + 1)} aria-label="Next page">›</button>
        <span class="count">{totalCount()} items</span>
        <Show when={loading()}><span class="loading" aria-live="polite">Loading…</span></Show>
  <button class="btn" onClick={loadPage}>Refresh</button>
      </div>

      <div class="thead" role="rowgroup">
        <For each={table.getHeaderGroups()}>{(hg) => (
          <div class="tr" role="row">
            <For each={hg.headers}>{(h) => (
              <div class="th" role="columnheader" style={{ width: `${h.getSize()}px` }}>
                {h.isPlaceholder ? null : (h.column.columnDef.header as any)()}
              </div>
            )}</For>
          </div>
        )}</For>
      </div>

      <div class="tbody" ref={scrollParent} role="rowgroup">
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          <For each={rowVirtualizer.getVirtualItems()}>{(vi) => {
            const row = table.getRowModel().rows[vi.index];
            return (
              <div class="tr" role="row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}>
                <For each={row.getVisibleCells()}>{(cell) => {
                  const cellDef = cell.column.columnDef.cell;
                  const cellContent = typeof cellDef === 'function' 
                    ? cellDef({ row, column: cell.column, table, cell } as any)
                    : cellDef;
                  return (
                    <div class="td" role="gridcell" style={{ width: `${cell.column.getSize()}px` }}>
                      {cellContent}
                    </div>
                  );
                }}</For>
              </div>
            );
          }}</For>
        </div>
      </div>
    </div>
  );
};

export default TableView;

// Renders a minimal inline editor for table cells, mapping column types to inputs and committing edits via props.onCommit.
function PrimitiveEditor(props: { readonly: boolean; type: ColumnType; value: any; onCommit: (v: any) => void }) {
  const [val, setVal] = createSignal(props.value);
  const commit = () => props.onCommit(val() as any);
  const isCheck = props.type === "checkbox";
  return (
    <>
      <Show when={isCheck}>
        <input type="checkbox" checked={!!val()} disabled={props.readonly}
               onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setVal(v); props.onCommit(v); }} />
      </Show>
      <Show when={!isCheck}>
        <input class="cell-input" disabled={props.readonly}
               type={props.type === "number" ? "number" : "text"}
               value={val() ?? ""}
               onInput={(e) => setVal((e.target as HTMLInputElement).value)}
               onBlur={commit}
               onKeyDown={(e) => (e.key === "Enter" ? commit() : null)} />
      </Show>
    </>
  );
}
