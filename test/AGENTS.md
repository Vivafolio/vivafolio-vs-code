### Agents and Test Logging Strategy

- Each test session creates a unique log file under `vivafolio/test/logs` with the pattern `<lang>-<timestamp>.log`.
- We record full LSP protocol traffic and relevant stderr from language servers.
- On success: tests print minimal output to keep logs out of AI context windows.
- On failure: the test runner prints the path and file size of the relevant log(s) so developers (or agents) can open them directly without flooding the console or context.
- Rationale: preserves context-budget for AI tools by avoiding large inline logs, while retaining full fidelity in files.
