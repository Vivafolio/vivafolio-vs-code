# Vivafolio Core & Headless Testing Plan

## Vision
Deliver a deterministic, editor-agnostic “Vivafolio Core” that lets us test the full diagnostic → block rendering → mutation loop in pure Node.js. VS Code-specific glue becomes a thin host adapter, while most behavior (payload parsing, entity graph updates, gui_state writes) lives in reusable modules that tests and future editors can call directly.

Key objective: **agents must be able to run the same tests that validate VS Code experiences without launching VS Code**.

---

## Component Model (new)

| Component | Responsibility | Notes |
| --- | --- | --- |
| `DiagnosticBridge` | Normalizes incoming diagnostics (from any LSP/runtime) into `VivafolioBlock` notifications. | Pure function: `diagnostics[] × document -> notifications[]`. |
| `CoreRuntime` | Owns block lifecycles: indexing mutations, block loader calls, sync callbacks. | Consumes normalized notifications; exposes events for “render block”, “update entity”, etc. |
| `LanguageAdapters` | Per-language helpers that translate gui_state/application data into source edits. | Registered by languageId; no VS Code imports. |
| `IndexingAdapter` | Interface sitting in front of the workspace indexer. Tests inject an in-memory implementation; production points at `@vivafolio/indexing-service`. | Eventually the indexing service will implement this interface directly. |
| `HostBindings` | Editor-specific shell (VS Code today). Listens to diagnostics, uses `CoreRuntime`, renders webviews, applies edits through editor API. | Thin; ideal for VS Code tests only. |

Communication flow (headless-capable):
1. `LspHarness` (test utility) connects to a server → collects diagnostics.
2. `DiagnosticBridge` converts diagnostics into normalized notifications.
3. `CoreRuntime` ingests notifications, asks `LanguageAdapters` for mutations, and emits events.
4. Tests assert on emitted events/logs without needing VS Code objects.

---

## Milestones

### Milestone 1 — Extract DiagnosticBridge (Mocklang & Lean)
**Deliverables**
- `src/core/diagnosticBridge.ts`: exports `normalizeDiagnostics({ diagnostics, documentUri })`.
- Tests: reuse the new headless scripts to pipe real diagnostics into `normalizeDiagnostics` and assert on block IDs, entity graphs, ranges.

**Example Test**
```ts
const notifications = normalizeDiagnostics({
  diagnostics,
  documentUri: pickerUri,
})
expect(notifications).toHaveLength(2)
expect(notifications[0].blockId).toBe('picker-3')
```

**Focus**: ensure the bridge injects fallback resources deterministically (using the same map as VS Code).

### Milestone 2 — CoreRuntime skeleton + event surface
**Deliverables**
- `src/core/runtime.ts` exposing:
  ```ts
  interface CoreRuntimeEvents {
    onRenderBlock(cb: (block: BlockNotification) => void): Disposable
    onGraphUpdate(cb: (entityId, graph) => void): Disposable
    onError(cb: (err) => void): Disposable
  }
  ```
  The runtime receives notifications, writes entities through a pluggable `IndexingAdapter` (mockable), and emits events describing what the host should render.
- Tests: feed normalized notifications (mocklang + Lean) and assert that `onRenderBlock` fires twice, entity store receives the expected payloads, and linked updates go through the proper adapter hooks.

**Goal**: standalone runtime can run entirely in Node tests (no VS Code webviews). We will stub the `IndexingAdapter` with an in-memory map.

### Milestone 3 — LanguageAdapter interface & mocklang/Lean adapters
**Deliverables**
- `src/languages/types.ts` defines:
  ```ts
  interface LanguageAdapter {
    languageId: string
    canHandle(notification: BlockNotification): boolean
    applyGuiStateEdit(documentText: string, entityUpdate: EntityUpdate): TextEdit[]
  }
  ```
- Implement `mocklangAdapter` (regex-based gui_state replacement) and `leanAdapter` (raw-string handling, linked macros).
- Tests: pure functions. Example: update `#{"color": "#000000"}` → expect new text and ensure other blocks not touched.

### Milestone 4 — HostBindings shim for VS Code
**Deliverables**
- `src/host/vscodeBindings.ts` marshalling layer that:
  - feeds `vscode.languages.onDidChangeDiagnostics` into `DiagnosticBridge` + `CoreRuntime`.
  - listens to runtime events and calls existing webview rendering code.
- WDIO & `test/vscode` suites updated to import this shim (minimal change).

### Milestone 5 — Headless Integration Tests
**Deliverables**
- `test/headless/mocklang-core.test.js`:
  1. Start mocklang LSP.
  2. Normalize diagnostics via `DiagnosticBridge`.
  3. Run them through `CoreRuntime` + adapters using in-memory stores.
  4. Assert we emit two render events and entity store contains color `#cd2a18`.
- `test/headless/lean-core.test.js`: same for Lean DSL.
- Additional harness for runtime languages: feed JSON-lines into `convertVivafolioBlockToDiagnostics` → `DiagnosticBridge` → `CoreRuntime`.

**Result**: a single test run covers LSP interaction through core logic without VS Code.

### Milestone 6 — CI + Agent Hooks
**Deliverables**
- `npm run test:headless:core` aggregates the new tests; documented in `AGENTS.md`.
- Update `docs/Vivafolio-E2E-Test-Status.md` to show that agents can validate both Mocklang and Lean flows by running headless suites (no VS Code).
- Optional: GitHub Actions job running these headless suites to gate PRs.

---

## Detailed Testing Strategy

### Harness Layers
1. **LSP Harness** (`test/headless/utils.js`):
   - Already in place for mocklang + Lean.
   - Will stay as the source of real diagnostics.
2. **DiagnosticBridge Tests**:
   - Pure function tests, see Milestone 1.
3. **Runtime Event Tests**:
   - Provide fake `IndexingAdapter` + `BlockLoader` mocks (promise-based) to assert the runtime’s sequencing.
4. **Adapter Tests**:
   - Feed sample gui_state sources + entity updates; assert resulting `TextEdit[]`.
5. **End-to-end headless tests**:
   - Compose harness + bridge + runtime + adapters, verifying final events without VS Code.

### Naming & Contracts
- `BlockNotification`: the normalized structure, same shape used today in `renderBlockProtocolBlock`.
- `IndexingAdapter`: interface the runtime uses to persist entities (backed by `@vivafolio/indexing-service`, a.k.a. the workspace indexer, in production). Tests substitute an in-memory implementation to keep fixture files untouched.
- `HostRenderEvent`: `{ blockId, blockType, resources, entityGraph, range }`.

### Example Headless Flow (Mocklang)
1. `startMocklangServer()` → diagnostics for `two_blocks.mocklang`.
2. `DiagnosticBridge.normalize()` → `[picker, square]`.
3. `CoreRuntime.ingest(notifications)`:
   - Adds both entities to the injected `IndexingAdapter`.
   - Emits two `HostRenderEvent`s.
   - No VS Code required.
4. Tests assert:
   - Entities persisted with color `#cd2a18`.
   - Render events reference fallback block resources.

### Example Headless Flow (Lean GUI sync)
1. Use Lean harness to get diagnostics for `PickerDemo.lean`.
2. Inject a simulated `updateEntity` event (color change).
3. `CoreRuntime` routes to `leanAdapter.applyGuiStateEdit`.
4. Adapter returns `TextEdit[]`; tests assert the resulting Lean source string has the new hex color.

---

## Future Extensions
- **Other Editors**: package `DiagnosticBridge` + `CoreRuntime` as `@vivafolio/core` so JetBrains or Neovim plugins can reuse the same logic.
- **Runtime path**: treat runtime execution output as synthetic diagnostics; same bridge + runtime handles them.
- **CI telemetry**: capture runtime events in logs for debugging.

---

## Next Steps Checklist
1. (in progress) Headless LSP harness (already built).
2. Extract diagnostic normalization + fallback logic into `src/core`.
3. Build core-runtime tests to iron out interfaces before rewiring VS Code.
4. Update docs (`Language-Module-Refactor.md`, `Vivafolio-E2E-Test-Status.md`) once headless suites ship.

When complete, any contributor/agent can run:
```bash
npm run test:headless:mocklang
npm run test:headless:lean
npm run test:headless:core  # future aggregate
```
…to validate LSP → core → adapter behavior end-to-end without VS Code. This keeps us productive and makes regressions obvious long before WDIO or manual VS Code sessions.
