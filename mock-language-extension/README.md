# Vivafolio Mock Language (Test Only)

This stand-alone VS Code extension contributes a mock language (`vivafolio-mock`, `*.viv`) and starts a simple LSP server used exclusively by the Vivafolio end-to-end tests. It prevents test plumbing from polluting the production Vivafolio extension.

- Language id: `vivafolio-mock`
- File extensions: `.viv`
- LSP server: launches `vivafolio/test/mock-lsp-server.js`

Status: DRAFT IMPLEMENTATION (do not ship).

Test objectives:
- Verify that opening a `.viv` file triggers mock LSP diagnostics with `vivafolio:` BlockSync payloads.
- Verify the production Vivafolio extension responds by inserting an inset webview and handling Block Protocol messages.
- Never cheat or shortcut tests; they must prove behavior inside VS Code.

Starting points:
- `src/extension.ts` — client startup and server wiring via `vscode-languageclient`
- `../test/mock-lsp-server.js` — server behavior and diagnostics
- `package.json` — language contribution metadata
