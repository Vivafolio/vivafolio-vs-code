
import { createSignal, For, Show } from "solid-js";
import type { ColumnDefCfg, ColumnType, TableConfig } from "./types";
import { uid } from "./utils";
import { migrateColumnType } from "./migrations";
import type { GraphLike } from "./migrations";

export function ColumnHeaderMenu(props: {
  graph: GraphLike;
  cfg: () => TableConfig;
  setCfg: (next: TableConfig) => void;
  col: ColumnDefCfg;
}) {
  const [open, setOpen] = createSignal(false);
  const [editingTitle, setEditingTitle] = createSignal(props.col.title);
  const [type, setType] = createSignal<ColumnType>(props.col.type);

  async function saveSchema(partial: Partial<ColumnDefCfg>) {
    const nextColumns = props.cfg().columns.map(c => c.id === props.col.id ? { ...c, ...partial } : c);
    const nextCfg = { ...props.cfg(), columns: nextColumns };
    props.setCfg(nextCfg);
  }

  async function onRename() { await saveSchema({ title: editingTitle() }); setOpen(false); }

  async function onChangeType(newType: ColumnType) {
    const prev = props.col.type;
    if (prev === newType) return;
    await saveSchema({ type: newType, options: newType === "select" ? (props.col.options ?? []) : undefined });
    await migrateColumnType(props.graph, props.cfg(), props.col, newType, props.col.options, (p) => {
      const ev = new CustomEvent("blockprotocol:hook", { detail: { type: "vivafolio:toast", text: `Migrated ${p.processed}/${p.total}` }, bubbles: true, composed: true });
      (document.currentScript?.ownerDocument ?? document).dispatchEvent(ev);
    });
    setOpen(false);
  }

  return (
    <div class="col-menu">
      <button class="btn" onClick={() => setOpen(!open())}>⋮</button>
      <Show when={open()}>
        <div class="menu">
          <div class="group">
            <label>Column name</label>
            <input value={editingTitle()} onInput={(e) => setEditingTitle((e.target as HTMLInputElement).value)} onBlur={onRename} />
          </div>
          <div class="group">
            <label>Type</label>
            <TypePicker value={type()} onChange={onChangeType} />
          </div>
          <Show when={type() === "select"}>
            <SelectOptionEditor
              options={props.col.options ?? []}
              onChange={async (opts) => saveSchema({ options: opts })}
            />
          </Show>
          <div class="group danger">
            <button class="link" onClick={async () => {
              const next = { ...props.cfg(), columns: props.cfg().columns.filter(c => c.id !== props.col.id) };
              props.setCfg(next);
              setOpen(false);
            }}>Delete column</button>
          </div>
        </div>
      </Show>
    </div>
  );
}

export function TypePicker(props: { value: ColumnType; onChange: (t: ColumnType) => void }) {
  const options: ColumnType[] = ["text","number","date","select","checkbox","person","relation","rollup","formula"];
  return (
    <div class="type-picker">
      <For each={options}>{(t) => (
        <button class={`type ${t} ${props.value === t ? "active" : ""}`} onClick={() => props.onChange(t)}>{t}</button>
      )}</For>
    </div>
  );
}

export function SelectOptionEditor(props: { options: { id: string; label: string; color?: string }[]; onChange: (opts: { id: string; label: string; color?: string }[]) => void }) {
  let local = [...props.options];
  function add() { local = [...local, { id: uid(), label: "New option" }]; props.onChange(local); }
  function setLabel(ix: number, label: string) { local = local.map((o,i) => i===ix?{...o,label}:o); props.onChange(local); }
  function remove(ix: number) { local = local.filter((_,i)=>i!==ix); props.onChange(local); }
  return (
    <div class="select-editor">
      <For each={local}>{(o, i) => (
        <div class="row">
          <input value={o.label} onInput={(e) => setLabel(i(), (e.target as HTMLInputElement).value)} />
          <button class="link" onClick={() => remove(i())}>Remove</button>
        </div>
      )}</For>
      <button class="btn" onClick={add}>Add option</button>
    </div>
  );
}
