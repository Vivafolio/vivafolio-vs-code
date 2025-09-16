# Block Protocol E2E POC

This package hosts the standalone web application and Playwright tests used to validate the Block Protocol integration plan outlined in `docs/BlockProtocol-E2E-POC.md`.

## Getting Started

```bash
cd apps/blockprotocol-poc
npm install
npm run dev
```

To execute the Playwright smoke tests:

```bash
just test-blockprotocol-poc
```

The development server listens on <http://localhost:4173> and exposes:
- `/` — static frontend that simulates the editor host
- `/ws` — WebSocket channel for VivafolioBlock notifications
- `/api/graph` — inspection endpoint for the in-memory entity graph
- `/healthz` — simple health probe for automation

## Project Layout

- `index.html` — entry HTML served by Vite/Express in dev & prod builds
- `src/server.ts` — Express + WebSocket server coordinating scenarios & graph updates
- `src/client/` — TypeScript frontend for the faux editor host and block renderers
- `tests/` — Playwright scenarios for each milestone

The server currently delivers placeholder payloads; upcoming milestones will stream real VivafolioBlock notifications sourced from Block Protocol blocks.

## Scenarios

- `/?scenario=hello-world` — Milestone 0 hello block
- `/?scenario=nested-kanban` — Milestone 1 nested Kanban view
- `/?scenario=multi-view-sync` — Milestone 2 Kanban + task list sync demo
- `/?scenario=iframe-webviews` — Milestone 3 iframe-based block loading

## Submodule

The Block Protocol repository is vendored at `third_party/blockprotocol`. Run `git submodule update --init --recursive` after cloning.
