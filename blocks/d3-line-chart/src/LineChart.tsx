import { For, Show, createMemo, createSignal, type Accessor } from 'solid-js';
import * as d3 from 'd3';

interface FacetDef {
  field: string; // which column to filter on
  label: string;
  control: 'select' | 'checkboxes';
  valueType: 'string' | 'number' | 'date';
  values?: Array<string | number>; //explicit list of filter options
}

interface Props {
  graph: Accessor<any>; // Host provides blockEntitySubgraph and graph ops via signal accessor
  blockId: Accessor<string>;
}

export default function LineChart(props: Props) {
  const rootEntity = () => props.graph()?.blockEntitySubgraph?.roots?.[0];
  const p = () => rootEntity()?.properties ?? {};
  const [hidden, setHidden] = createSignal<Set<string>>(new Set());
  const [filters, setFilters] = createSignal<Record<string, unknown>>({ ...(p().filterDefaults || {}) });
  const [chartWidth, setChartWidth] = createSignal<number>(p().width ?? 800);
  const [chartHeight, setChartHeight] = createSignal<number>(p().height ?? 400);

  const rows = createMemo<any[]>(() => (Array.isArray(p().rows) ? p().rows : []));
  const xField = createMemo<string>(() => p().xField || (rows()[0] ? Object.keys(rows()[0])[0] : 'x'));
  const yField = createMemo<string>(() => p().yField || (rows()[0] ? Object.keys(rows()[0])[1] : 'y'));

  const parseX = (v: unknown) => {
    if (p().xType === 'date') {
      const parser = d3.timeParse(p().dateFormat || '%Y-%m-%d');
      return v instanceof Date ? v : parser(String(v));
    }
    return typeof v === 'number' ? v : +String(v);
  };

  const filteredRows = createMemo(() => {
    const f = filters();
    return rows()
      .filter((r) => {
        for (const [field, val] of Object.entries(f)) {
          if (val == null) continue;
          const rv = r[field];
          if (Array.isArray(val)) {
            if (!(val as unknown[]).includes(rv)) return false;
          } else if (rv !== val) return false;
        }
        return true;
      })
      .map((r) => ({ ...r, __x__: parseX(r[xField()]), __y__: +r[yField()] }))
      .filter((r) => r.__x__ != null && !Number.isNaN(r.__y__));
  });

  const bySeries = createMemo(() => {
    const key = p().seriesField as string | undefined;
    const out = new Map<string, any[]>();
    for (const r of filteredRows()) {
      const k = key ? String(r[key]) : '__single__';
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(r);
    }
    return out;
  });

  const seriesKeys = createMemo(() => Array.from(bySeries().keys()));

  const mountChart = (el: HTMLDivElement) => {
    if (!el) return;

    const width = chartWidth();
    const height = chartHeight();
    const margin = { top: 16, right: 24, bottom: 32, left: 44 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const svg = d3.select(el).append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const flat = filteredRows();
    const xDomain = d3.extent(flat, (d: any) => d.__x__ as any) as [any, any];
    const yDomain = d3.extent(flat, (d: any) => d.__y__ as any) as [any, any];

    const x = p().xType === 'date'
      ? d3.scaleTime().domain(xDomain as [Date, Date]).range([0, innerW])
      : d3.scaleLinear().domain(xDomain as [number, number]).nice().range([0, innerW]);

    const y = d3.scaleLinear().domain(yDomain as [number, number]).nice().range([innerH, 0]);

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x as any).ticks(6));
    g.append('g').call(d3.axisLeft(y).ticks(6));
    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).tickSize(-innerW).tickFormat(() => ''));

    const color = p().color ? (() => p().color) : d3.scaleOrdinal(d3.schemeTableau10).domain(seriesKeys() as any);
    const line = d3
      .line<any>()
      .x((d) => (x as any)(d.__x__))
      .y((d) => y(d.__y__))
      .defined((d) => d.__x__ != null && !Number.isNaN(d.__y__));

    for (const [key, vals] of bySeries()) {
      if (hidden().has(key)) continue;
      const sorted = vals.slice().sort((a, b) => +a.__x__ - +b.__x__);
      g
        .append('path')
        .datum(sorted)
        .attr('fill', 'none')
        .attr('stroke', typeof color === 'function' ? (color as any)(key) : (color as any))
        .attr('stroke-width', 1.75)
        .attr('d', line as any);
    }
  };

  const toggleSeries = (key: string) => {
    const next = new Set(hidden());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    rerender();
  };

  let chartMount!: HTMLDivElement;
  const rerender = () => {
    chartMount.innerHTML = '';
    mountChart(chartMount);
  };

  // Initial render
  setTimeout(rerender);

  return (
    <div class="d3-line-graph-block" role="img" aria-label="Line chart">
      <header>
        <h2>{p().title || ''}</h2>
        <div class="size-controls">
          <label>
            Width: <input 
              type="number" 
              min="300" 
              max="2000" 
              step="50"
              value={chartWidth()} 
              onInput={(e) => {
                const val = parseInt((e.target as HTMLInputElement).value);
                if (!isNaN(val) && val >= 300) {
                  setChartWidth(val);
                  rerender();
                }
              }}
            />png   
          </label>
          <label>
            Height: <input 
              type="number" 
              min="200" 
              max="1000" 
              step="50"
              value={chartHeight()} 
              onInput={(e) => {
                const val = parseInt((e.target as HTMLInputElement).value);
                if (!isNaN(val) && val >= 200) {
                  setChartHeight(val);
                  rerender();
                }
              }}
            />px
          </label>
        </div>
        <div class="controls">
          <For each={(p().facets as FacetDef[]) || []}>{(facet) => {
            const vals = () =>
              facet.values && facet.values.length
                ? facet.values
                : Array.from(new Set(rows().map((r) => r[facet.field])));
            return (
              <label class="facet">
                {facet.label}:
                <Show when={facet.control === 'select'}>
                  <select
                    onChange={(e) => {
                      const raw = (e.target as HTMLSelectElement).value;
                      const parsed = raw === '' ? undefined : facet.valueType === 'number' ? +raw : raw;
                      const next = { ...filters() } as any;
                      if (parsed === undefined) delete next[facet.field];
                      else next[facet.field] = parsed;
                      setFilters(next);
                      rerender();
                    }}
                  >
                    <option value="">—</option>
                    <For each={vals() as any[]}>{(v) => <option value={String(v)}>{String(v)}</option>}</For>
                  </select>
                </Show>
                <Show when={facet.control === 'checkboxes'}>
                  <For each={vals() as any[]}>{(v) => {
                    const id = `${facet.field}-${String(v)}`;
                    const cur = new Set((filters()[facet.field] as any[]) || []);
                    return (
                      <span>
                        <input
                          id={id}
                          type="checkbox"
                          checked={cur.has(v)}
                          onChange={(e) => {
                            const nextSet = new Set((filters()[facet.field] as any[]) || []);
                            if ((e.target as HTMLInputElement).checked) nextSet.add(v);
                            else nextSet.delete(v);
                            const next = { ...filters() } as any;
                            if (nextSet.size) next[facet.field] = Array.from(nextSet);
                            else delete next[facet.field];
                            setFilters(next);
                            rerender();
                          }}
                        />
                        <label for={id}>{String(v)}</label>
                      </span>
                    );
                  }}</For>
                </Show>
              </label>
            );
          }}</For>
        </div>
      </header>

      <div class="chart-wrap" ref={chartMount!} />

      <Show when={p().showLegend !== false}>
        <div class="legend" role="list">
          <For each={seriesKeys()}>{(k) => (
            <button type="button" aria-pressed={!hidden().has(k)} onClick={() => toggleSeries(k)}>
              {k}
            </button>
          )}</For>
        </div>
      </Show>
    </div>
  );
}