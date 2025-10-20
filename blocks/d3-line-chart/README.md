# 📈 D3 Line Chart Block (SolidJS + D3)

An **interactive, generic line chart** block built with **D3.js** and **SolidJS**, authored to the **updated Block Authoring Standard v3**.

---

## ✅ Standard Conformance
- Custom element `<bp-d3-line-chart>`
- Host sets `graph` and `blockId` synchronously for hydration
- No external network calls, all assets bundled locally
- Strict schema in `block-metadata.json`, resources point to `dist/app.js` and `dist/styles.css`
- Accessibility: ARIA roles, keyboard-focusable legend, VS Code theming

---

## 📁 File Structure
```
d3-line-chart/
├─ block-metadata.json
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ src/
│  ├─ index.ts
│  ├─ LineChart.tsx
│  └─ styles.css
└─ dist/
   ├─ app.js
   └─ styles.css
```

---

## 🔧 Features
- Single or multi-series (`seriesField`)
- Legend toggle (show/hide)
- Facet filters (`select`, `checkboxes`)
- Number or date x-axis (`xType`, `dateFormat`)
- **Live resizable** dimensions with UI controls
- Configurable via props (`width`, `height`)
- A11y and theme-aware

---

## 📝 Schema Example
```json
{
  "rows": [ { "x": 1, "y": 2 } ],
  "xField": "x",
  "yField": "y",
  "xType": "number",
  "dateFormat": "%Y-%m-%d",
  "seriesField": "geo",
  "width": 800,
  "height": 400,
  "facets": [ { "field": "geo", "label": "Country", "control": "checkboxes", "valueType": "string" } ],
  "filterDefaults": { "geo": ["DE", "FR"] },
  "showLegend": true
}
```

### Property Reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `rows` | array | **required** | Array of data objects |
| `xField` | string | first key | Field name for x-axis |
| `yField` | string | second key | Field name for y-axis |
| `xType` | "number" \| "date" | "number" | X-axis data type |
| `dateFormat` | string | "%Y-%m-%d" | Date parsing format (d3-time-format) |
| `seriesField` | string | - | Field for grouping multiple series |
| `width` | number | 640 | Chart width in pixels (falls back to container width) |
| `height` | number | 320 | Chart height in pixels |
| `title` | string | - | Chart title |
| `color` | string | - | Single color or use default palette |
| `showLegend` | boolean | true | Show/hide legend |
| `legendPosition` | string | "top-right" | Legend position |
| `showFilterPanel` | boolean | true | Show/hide filter panel |
| `facets` | array | - | Filter configuration |
| `filterDefaults` | object | - | Default filter values |
| `persistFilterSelection` | boolean | false | Remember filter state |

---

## 🧩 Host Integration
```ts
const el = document.createElement('bp-d3-line-chart');
el.graph = { blockEntitySubgraph };
el.blockId = 'uuid-123';
container.appendChild(el);
```

---

## 🚀 Development
```bash
npm install
npm run dev
npm run build
```

---

## ♿ Accessibility
- Chart `role="img"` with `aria-label`
- Legend buttons keyboard focusable with `aria-pressed`
- Filters labeled and grouped

---

## 📄 License
MIT