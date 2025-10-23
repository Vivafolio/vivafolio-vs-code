
# TableViewBlock (Solid + TanStack) — Solid Block API

Generic, virtualized table view for Vivafolio/Block Protocol with Coda-like schema editing.

## Features
- Headless TanStack Table + Virtual for performance
- Solid Block API integration (`createBlockElement`, `useEntity`)
- Chip blocks inside cells via hook (`vivafolio:embed:entity`)
- Coda-style column editor (rename, type change, select options)
- Data migration when changing column types (server-paged via `aggregateEntities`)

## Build
```bash
pnpm i
pnpm build
```

## Files
- `block-metadata.json` — block manifest
- `src/index.ts` — custom element bootstrap (Solid Block API)
- `src/TableViewBlock.tsx` — main table view
- `src/schema/*` — schema types, utils, migrations, header menu
- `src/styles.css` — minimal, theme-aware styles

## Host contract
- Host injects `graph` prop with `aggregateEntities`, `updateEntity`, `blockEntity`
- Root entity `.properties` holds table config:
```ts
interface TableConfig {
  collectionId: string;
  columns: { id: string; title: string; path: string; type: string; width?: number; chipBlockType?: string; options?: {id:string;label:string;color?:string}[] }[];
  sort?: { path: string; dir: 'asc'|'desc' }[];
  filters?: { path: string; op: string; value?: unknown }[];
  pageSize?: number;
}
```
