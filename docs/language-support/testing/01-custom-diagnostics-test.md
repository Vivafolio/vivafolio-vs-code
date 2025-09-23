# Custom Diagnostics Test

## Overview

The `custom-diagnostics` test is a specialized test that applies **only to languages supported through LSP server integration**. This test verifies the ability to emit custom diagnostic messages and tests the `DiagnosticAdapter` processing pipeline.

## Purpose

This test ensures that:

1. **LSP Diagnostic Emission**: Languages can emit custom `hint` or `info` level diagnostics
2. **Message Format**: Diagnostics contain properly formatted JSON payloads
3. **DiagnosticAdapter Processing**: The `DiagnosticAdapter` correctly processes and extracts diagnostic messages
4. **Language-Specific Handling**: Different LSP servers and message formats are handled correctly

## Test Implementation

### Test Structure

The test consists of a simple source file that emits a custom diagnostic message in a language-specific way:

```nim
{.hint: "Vivafolio: {value: {}}".};
```

### Expected Behavior

#### LSP Server Emission
- The language's LSP server emits a diagnostic with severity `Hint` (4) or `Info` (3)
- The diagnostic message contains: `Vivafolio: {value:{}}`
- The diagnostic range points to the source location of the emission

#### DiagnosticAdapter Processing
The `DiagnosticAdapter` (see [`packages/diagnostics-adapter/`](../../../packages/diagnostics-adapter/) in the README) processes the raw LSP diagnostic to:

- Extract the JSON payload from the diagnostic message
- Remove any language-specific artifacts or decorations
- Verify that the stripping leave the expected message

### Test Verification

The stand-alone test runner verifies:

1. **Diagnostic Emission**: Exactly 1 diagnostic is emitted with the expected message format
3. **Adapter Processing**: The `DiagnosticAdapter` successfully processes the diagnostic
4. **No Block Emission**: This test does **not** emit `VivafolioBlock` notifications - only custom diagnostics

### Testing Commands

Run the custom diagnostics test:

```bash
# Test all LSP-supported languages for custom diagnostics
just test-stand-alone custom-diagnostics

# Test specific language
just test-stand-alone nim custom-diagnostics
```

## Relevance

This test is **LSP-only** because:

- Runtime languages (Python, Ruby, JavaScript, Julia) execute scripts and emit to stdout, where we have full control, so such as simple test would be unnecessary.
- The test specifically verifies LSP diagnostic emission and `DiagnosticAdapter` processing
- Runtime languages use the `LangExecutor` path which doesn't involve diagnostic processing





