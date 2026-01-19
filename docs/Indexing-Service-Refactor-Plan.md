# Indexing Service Refactor Plan

## Goal
Turn `@vivafolio/indexing-service` (a.k.a. the workspace indexer) into a reusable platform component that can run inside VS Code, headless tests, and future editors. The service will expose a clear interface (`IndexingAdapter`) with pluggable backends:
- **VS Code Workspace Backend** (current behavior)
- **In-Memory/Test Backend** (for headless suites)
- **CLI/Other Editor Backends** (future)

Refactoring steps align with the Core Headless Testing roadmap so the core runtime can swap backends without touching editor-specific code.

---

## Architecture Targets

| Layer | Responsibility | Notes |
| --- | --- | --- |
| `IndexingAdapter` interface | Canonical contract: start/stop, entity CRUD, subscription hooks, file mutation helpers. | Used by `CoreRuntime`, tests, and other hosts. |
| `VscodeIndexingAdapter` | Concrete adapter that wraps today’s workspace indexer (file watchers, `vscode.workspace.applyEdit`, etc.). | Lives in `packages/indexing-service/adapters/vscode`. |
| `MemoryIndexingAdapter` | Pure in-memory implementation for headless tests. | Lives in `packages/indexing-service/adapters/memory`. |
| `CliIndexingAdapter` (future) | Reads/writes real files without VS Code, using Node fs watchers. | Optional milestone once core + tests are stable. |

---

## Milestones

### Milestone 1 — Define `IndexingAdapter` Interface
**Deliverables**
- `packages/indexing-service/src/types.ts` exporting:
  ```ts
  interface IndexingAdapter {
    start(): Promise<void>
    stop(): Promise<void>
    upsertEntity(entity: Entity): Promise<void>
    removeEntity(entityId: string): Promise<void>
    getEntity(entityId: string): Promise<Entity | undefined>
    subscribe(event: 'entityChanged' | 'fileChanged', handler: Listener): Disposable
    applyEdits(edits: TextEdit[]): Promise<void>
  }
  ```
- Map existing service methods onto this shape (no behavior change yet).
- Document the contract in `packages/indexing-service/README.md`.

### Milestone 2 — Extract VS Code Implementation
**Deliverables**
- Move current logic (file watchers, persistence, `vscode.workspace.applyEdit`) into `VscodeIndexingAdapter`.
- `packages/indexing-service/src/index.ts` becomes a thin factory:
  ```ts
  export function createIndexingService(env: 'vscode' | 'memory' | ...) { ... }
  ```
- Ensure existing `src/extension.ts` still imports the same entry point (zero runtime changes).

### Milestone 3 — Build Memory/Test Adapter
**Deliverables**
- `MemoryIndexingAdapter` storing entities and file contents in JS maps.
- Supports subscriptions by calling handlers synchronously.
- Add unit tests verifying CRUD + subscription semantics.
- Integrate with headless core tests (`npm run test:headless:core` once available).

### Milestone 4 — Adapter Selection Wiring
**Deliverables**
- `CoreRuntime` accepts an `IndexingAdapter` instance.
- VS Code host passes `createIndexingService('vscode')`.
- Headless tests pass `createIndexingService('memory')`.
- Document adapter selection in `docs/Core-Headless-Testing-Plan.md` + `docs/Vivafolio-Architecture.md`.

### Milestone 5 — Optional CLI Adapter (Post-Core)
**Deliverables**
- `CliIndexingAdapter`: uses Node FS APIs, no VS Code dependency.
- Enables command-line tooling (e.g., `vivafolio sync`) to run the same graph logic.
- Gate behind separate milestone; not required for headless tests but sets us up for future editor support.

---

## Testing Strategy
1. **Unit tests per adapter** – memory adapter runs entirely in Jest/Mocha; VS Code adapter covered indirectly via existing WDIO + extension tests.
2. **Integration tests** – reuse the headless harness to confirm memory adapter + core runtime produce deterministic results with mocklang/Lean diagnostics.
3. **Regression tests** – `npm run test:vscode:inset-management` ensures the VS Code adapter behaves identically after the refactor.

---

## Risks & Mitigations
| Risk | Mitigation |
| --- | --- |
| Interface drift (core vs. adapters) | Keep `IndexingAdapter` in the package itself; document every method in the README. |
| VS Code-specific APIs leaking into core | Adapter boundary enforces that only the VS Code implementation touches the `vscode` module. |
| Tests mutating fixtures | Memory adapter never writes to disk; CLI adapter (future) will operate on temp directories during tests. |

---

## Next Steps
1. Implement Milestone 1 (interface) immediately so the core runtime work can compile against it.
2. Coordinate with the Core Headless Testing plan when introducing the memory adapter.
3. Update `docs/Vivafolio-Architecture.md` once adapters are live, showing “Workspace Indexer” as a pluggable component.
