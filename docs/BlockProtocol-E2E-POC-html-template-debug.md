# HTML Template Block Integration – Debug Report (2025-09-17)

## Context
- **Goal:** Exercise an additional published Block Protocol bundle (the HTML template block living in `third_party/blockprotocol/libs/block-template-html`) inside the `blockprotocol-poc` web host to validate loader generality beyond the npm `test-npm-block` bundle.
- **Scenario:** Added `html-template-block` milestone to `apps/blockprotocol-poc/src/server.ts`, exposing resources via `/external/html-template-block/...` and rendering it through the common `renderPublishedBlock` path in the client (`apps/blockprotocol-poc/src/client/main.ts`).
- **Expectation:** The HTML-based block should load `app.html` + `app.js`, display the initial greeting, and respond to host-driven graph updates. Playwright test `renders HTML entry block and propagates updates` covers this flow.

## Observed Failure
- Playwright consistently reports `Failed to load published block: Error: ENOENT ... apps/third_party/blockprotocol/libs/block-template-html/src/app.html` and times out waiting for the block title (`Hello, Vivafolio Template Block`).
- The POC UI shows the same error string in the runtime panel. All other milestones continue passing.

## What Was Tried
1. **Direct Static Serving**  
   - Initial approach used `express.static` to serve assets straight from `third_party/blockprotocol/libs/block-template-html` (analogous to `test-npm-block/dist`).  
   - Result: Express attempted to `stat` files under `/apps/third_party/...` (one level higher than the actual repo root) and 404’d, triggering the ENOENT error surfaced above.

2. **Path Fixes for Source Directory**  
   - Adjusted path resolution to use `path.resolve(ROOT_DIR, '..', '..', 'third_party', ...)` so the source directory matches `/home/.../third_party/blockprotocol/...`.  
   - Confirmed via node REPL that the constant resolves to the correct absolute path.  
   - Despite the change, runtime errors still referenced `/apps/third_party/...`, indicating Express was not reading the updated constant (likely because the default static handler still pointed at the old location).

3. **Custom `sendFile` Handlers**  
   - Replaced `express.static` with bespoke `app.get('/external/html-template-block/...', ...)` handlers that call `res.sendFile` with the resolved absolute path.  
   - Issue persisted: ENOENT continued to reference `/apps/third_party/...`, implying the handler was still hitting the wrong base path (or requests were falling through to the catch-all route).

4. **Copy-on-Startup to Local `external/` Directory**  
   - Introduced `ensureHtmlTemplateAssets()` to copy `block-metadata.json`, `src/app.html`, `src/app.js`, and `public/omega.svg` into `apps/blockprotocol-poc/external/html-template-block/...` on server bootstrap.  
   - Mounted fresh statics from that directory (`/external/html-template-block/...`).  
   - Verified manually (via a standalone script) that the copied files exist in the `external/` directory.  
   - Playwright still encountered ENOENT at the old `/apps/third_party/...` source path, suggesting the dynamic copy either didn’t run before serving or another route is still pointing upstream.

5. **Manual Asset Copy**  
   - To eliminate timing concerns, copied the template assets into `apps/blockprotocol-poc/external/html-template-block` manually (checked into the repo).  
   - Re-ran tests—same ENOENT error string.

6. **Client Diagnostics**  
   - Added loader diagnostics to `renderPublishedBlock` (HTML mode) to log bundle URL / dependencies.  
   - With the HTML block failing early, diagnostics never populate; the runtime panel only shows the ENOENT error.

## Current Hypothesis
- Express is still trying to serve from the original `third_party` directory through an outdated route or cached handler, despite the new copy/static setup. The error path (`/apps/third_party/...`) matches the earlier, incorrect `path.resolve` calculation, hinting that some code path (possibly cached or pre-built) is still using the stale constant.
- Because tests spawn the server via `tsx`, TypeScript execution might be referencing a compiled artefact (`dist/server/server.js`) created before the path fix. When the tests run, Playwright starts the compiled server (which still has the old path) rather than the updated `src/server.ts`.

## Suggested Next Steps for External Review
1. **Verify Server Entry Path**  
   - Confirm `npm run dev:once` (or Playwright’s `dev:once`) actually executes `src/server.ts` instead of `dist/server/server.js`. If the compiled artefact is used, clean `dist/` and rebuild so the new path logic is present.

2. **Instrument Requests**  
   - Temporarily add Express middleware to log `req.originalUrl` and the absolute path being resolved (`res.sendFile` or `express.static` root). This should identify the route handling `/external/html-template-block/src/app.html` and the path it attempts to serve.

3. **Serve from `apps/blockprotocol-poc/external` Only**  
   - Once confirmed, simplify the setup by serving assets exclusively from `apps/blockprotocol-poc/external/html-template-block` with no dynamic copy (commit the assets to the repo). This reduces complexity and ensures consistent paths.

4. **Update Playwright Expectations**  
   - After the HTML block loads successfully, adjust the Playwright test to account for any async delay (e.g., wait for `input[data-input]` before checking the title to absorb template rendering latency).

5. **Consider a Lightweight HTML Fixture**  
   - If routing remains brittle, include a minimal HTML block fixture directly under `apps/blockprotocol-poc/external/` to remove dependence on the third-party repo while investigating.

## File References
- `apps/blockprotocol-poc/src/server.ts` (HTML template constants & asset copying)  
  - Definitions near lines 40–90, copying in `ensureHtmlTemplateAssets()`, routes in `bootstrap()`.
- `apps/blockprotocol-poc/src/client/main.ts` (HTML/lib loader integration).  
  - `renderPublishedBlock` now supports `mode === 'html'` (~line 400 onwards).
- `apps/blockprotocol-poc/tests/hello-block.spec.ts` (new HTML scenario coverage).  
  - Test `renders HTML entry block and propagates updates` (~line 200).

---
Please let me know if more runtime logs or stack traces would be helpful. The failing test artifact (Playwright HTML report) remains in `apps/blockprotocol-poc/test-results/hello-block-Milestone-0-–--17c79-lock-and-propagates-updates/`.
