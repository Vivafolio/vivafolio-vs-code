const assert = require('assert')
const rpc = require('vscode-jsonrpc/node')
const { spawn } = require('child_process')
const path = require('path')

function startServer() {
	const serverPath = path.resolve(__dirname, 'mock-lsp-server.js')
	const proc = spawn('node', [serverPath], { stdio: 'pipe', env: process.env, cwd: path.dirname(serverPath) })
	const conn = rpc.createMessageConnection(
		new rpc.StreamMessageReader(proc.stdout),
		new rpc.StreamMessageWriter(proc.stdin)
	)
	conn.listen()
	return { conn, proc }
}

async function waitForDiagnostics(conn, uri, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('Timeout waiting for diagnostics')), timeoutMs)
		conn.onNotification('textDocument/publishDiagnostics', (params) => {
			if (params.uri === uri) { clearTimeout(t); resolve(params) }
		})
	})
}

async function run() {
	const { conn, proc } = startServer()
	try {
		await conn.sendRequest('initialize', { processId: null, capabilities: {}, rootUri: null, workspaceFolders: null })
		await conn.sendNotification('initialized', {})

		const uri = 'file:///test/syntax-error.mocklang'
		// Start with valid JSON
		let text = 'vivafolio_picker!() gui_state! r#"{ "color": "#00ff00" }"#\nvivafolio_square!()\n'
		await conn.sendNotification('textDocument/didOpen', {
			textDocument: { uri, languageId: 'mocklang', version: 1, text }
		})
		let diags = await waitForDiagnostics(conn, uri)
		assert(Array.isArray(diags.diagnostics) && diags.diagnostics.length >= 2, 'expect two diagnostics initially')
		// Ensure no error on valid content
		const hasErrorInitial = diags.diagnostics.some(d => {
			try { return !!JSON.parse(String(d.message).slice('vivafolio: '.length)).error } catch { return false }
		})
		assert(!hasErrorInitial, 'no syntax error on initial valid state')

		// Make JSON invalid mid-edit (invalid hex length)
		text = 'vivafolio_picker!() gui_state! r#"{ "color": "#00ff" }"#\nvivafolio_square!()\n'
		await conn.sendNotification('textDocument/didChange', {
			textDocument: { uri, version: 2 },
			contentChanges: [{ text }]
		})
		diags = await waitForDiagnostics(conn, uri)
		assert(diags.diagnostics.length >= 2, 'should still emit diagnostics for both blocks')
		const errors = diags.diagnostics.map(d => {
			try { return JSON.parse(String(d.message).slice('vivafolio: '.length)).error } catch { return undefined }
		})
		assert(errors.some(Boolean), 'at least one diagnostic should carry a syntax error')
		// When error present, server must not inject an entityGraph override
		const payloads = diags.diagnostics.map(d => { try { return JSON.parse(String(d.message).slice('vivafolio: '.length)) } catch { return {} } })
		for (const p of payloads) {
			if (p.error) assert(p.entityGraph == null, 'error payloads must have null entityGraph')
		}

		// Restore valid JSON
		text = 'vivafolio_picker!() gui_state! r#"{ "color": "#123456" }"#\nvivafolio_square!()\n'
		await conn.sendNotification('textDocument/didChange', {
			textDocument: { uri, version: 3 },
			contentChanges: [{ text }]
		})
		diags = await waitForDiagnostics(conn, uri)
		const restored = diags.diagnostics.map(d => JSON.parse(String(d.message).slice('vivafolio: '.length)))
		assert(restored.every(p => !p.error), 'no error after restoring valid JSON')
		assert(restored.every(p => p.entityGraph && p.entityGraph.entities && p.entityGraph.entities.length > 0), 'entityGraph present after recovery')
		const colors = restored.map(p => p.entityGraph.entities[0].properties.color).filter(Boolean)
		assert(colors.includes('#123456'), 'recovered color should propagate')

		console.log('LSP syntax error semantics test passed')
		process.exit(0)
	} catch (e) {
		console.error('LSP syntax error semantics test failed:', e && e.stack ? e.stack : String(e))
		process.exit(1)
	} finally {
		try { proc.kill() } catch { }
		conn.dispose()
	}
}

if (require.main === module) run()
