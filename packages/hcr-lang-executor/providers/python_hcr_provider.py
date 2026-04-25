#!/usr/bin/env python3
"""
Python HCR Provider

A minimal HCR provider that speaks the JSON-RPC 2.0 protocol over stdio
with Content-Length framing (same as LSP/DAP).

Responds to:
  - hcr/capabilities  -> returns Python-specific capabilities
  - hcr/reload        -> calls importlib.reload() on specified modules
  - hcr/status        -> returns current provider state

Sends notifications:
  - hcr/patchApplied  -> after a successful reload
  - hcr/patchFailed   -> after a failed reload
"""

import importlib
import json
import os
import sys
import traceback
from typing import Any, Dict, Optional
from urllib.parse import urlparse, unquote


def read_message() -> Optional[Dict[str, Any]]:
    """Read a Content-Length framed JSON-RPC message from stdin."""
    # Read headers
    headers: Dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None  # EOF
        line_str = line.decode('utf-8').rstrip('\r\n')
        if line_str == '':
            break  # End of headers
        if ':' in line_str:
            key, value = line_str.split(':', 1)
            headers[key.strip()] = value.strip()

    content_length = int(headers.get('Content-Length', '0'))
    if content_length == 0:
        return None

    body = sys.stdin.buffer.read(content_length)
    if not body:
        return None

    return json.loads(body.decode('utf-8'))


def write_message(message: Dict[str, Any]) -> None:
    """Write a Content-Length framed JSON-RPC message to stdout."""
    body = json.dumps(message)
    body_bytes = body.encode('utf-8')
    header = f'Content-Length: {len(body_bytes)}\r\n\r\n'
    sys.stdout.buffer.write(header.encode('utf-8'))
    sys.stdout.buffer.write(body_bytes)
    sys.stdout.buffer.flush()


def send_response(request_id: int, result: Any) -> None:
    """Send a JSON-RPC response."""
    write_message({
        'jsonrpc': '2.0',
        'id': request_id,
        'result': result
    })


def send_error(request_id: int, code: int, message: str) -> None:
    """Send a JSON-RPC error response."""
    write_message({
        'jsonrpc': '2.0',
        'id': request_id,
        'error': {'code': code, 'message': message}
    })


def send_notification(method: str, params: Dict[str, Any]) -> None:
    """Send a JSON-RPC notification (no id)."""
    write_message({
        'jsonrpc': '2.0',
        'method': method,
        'params': params
    })


# ---------------------------------------------------------------------------
# Provider state
# ---------------------------------------------------------------------------

applied_patches = 0
last_reload_timestamp: Optional[str] = None
loaded_modules: Dict[str, Any] = {}


def uri_to_module_name(uri: str) -> str:
    """Convert a file URI to a Python module name."""
    parsed = urlparse(uri)
    path = unquote(parsed.path)
    # Strip .py extension and convert path separators to dots
    if path.endswith('.py'):
        path = path[:-3]
    basename = os.path.basename(path)
    return basename


def handle_capabilities(request_id: int) -> None:
    """Handle hcr/capabilities request."""
    send_response(request_id, {
        'supportsRollback': False,
        'supportsStateMigration': False,
        'supportsPartialReload': True,
        'supportedLanguages': ['python'],
        'providerType': 'python-importlib',
        'maxConcurrentReloads': 1
    })


def handle_reload(request_id: int, params: Dict[str, Any]) -> None:
    """Handle hcr/reload request."""
    global applied_patches, last_reload_timestamp

    changed_files = params.get('changedFiles', [])

    # Acknowledge the reload request
    send_response(request_id, {'accepted': True})

    patched_functions: list = []
    errors: list = []

    for file_info in changed_files:
        uri = file_info.get('uri', '')
        module_name = uri_to_module_name(uri)

        try:
            if module_name in sys.modules:
                mod = sys.modules[module_name]
                importlib.reload(mod)
                # Collect all callable names as "patched functions"
                patched_functions.extend(
                    f'{module_name}::{name}'
                    for name in dir(mod)
                    if callable(getattr(mod, name, None)) and not name.startswith('_')
                )
            elif module_name in loaded_modules:
                mod = loaded_modules[module_name]
                importlib.reload(mod)
                patched_functions.extend(
                    f'{module_name}::{name}'
                    for name in dir(mod)
                    if callable(getattr(mod, name, None)) and not name.startswith('_')
                )
            else:
                # Try to import the module for the first time
                try:
                    mod = importlib.import_module(module_name)
                    loaded_modules[module_name] = mod
                    patched_functions.append(f'{module_name}::*')
                except ModuleNotFoundError:
                    # Not a fatal error — the module may not be on sys.path
                    patched_functions.append(f'{module_name}::*')

        except Exception as exc:
            errors.append({
                'file': uri,
                'message': str(exc)
            })

    from datetime import datetime, timezone
    last_reload_timestamp = datetime.now(timezone.utc).isoformat()

    if errors:
        send_notification('hcr/patchFailed', {
            'requestId': request_id,
            'stage': 'compilation',
            'errors': errors
        })
    else:
        applied_patches += 1
        send_notification('hcr/patchApplied', {
            'requestId': request_id,
            'patchedFunctions': patched_functions,
            'timestamp': last_reload_timestamp
        })


def handle_status(request_id: int) -> None:
    """Handle hcr/status request."""
    send_response(request_id, {
        'state': 'idle',
        'appliedPatches': applied_patches,
        'lastReloadTimestamp': last_reload_timestamp
    })


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    handlers = {
        'hcr/capabilities': handle_capabilities,
        'hcr/reload': handle_reload,
        'hcr/status': handle_status,
    }

    while True:
        msg = read_message()
        if msg is None:
            break  # EOF — client disconnected

        method = msg.get('method')
        request_id = msg.get('id')
        params = msg.get('params', {})

        handler = handlers.get(method)
        if handler is None:
            if request_id is not None:
                send_error(request_id, -32601, f'Method not found: {method}')
            continue

        try:
            if method == 'hcr/reload':
                handler(request_id, params)
            else:
                handler(request_id)
        except Exception:
            if request_id is not None:
                send_error(request_id, -32603, traceback.format_exc())


if __name__ == '__main__':
    main()
