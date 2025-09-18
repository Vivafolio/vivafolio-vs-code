import * as path from 'path'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export async function activate(_context: vscode.ExtensionContext) {
  try {
    const serverModule = path.resolve(__dirname, '../../test/mock-lsp-server.js')
    // Allow forcing inspector in non-debug sessions via env vars
    // VIVAFOLIO_LSP_INSPECT: '1'|'true' => --inspect, 'brk'|'break' => --inspect-brk
    // VIVAFOLIO_LSP_INSPECT_PORT: port to use (default 6009)
    const inspectEnv = String(process.env.VIVAFOLIO_LSP_INSPECT || '').toLowerCase()
    const inspectPort = String(process.env.VIVAFOLIO_LSP_INSPECT_PORT || '').trim() || '6009'
    const runExecArgv: string[] = ['--nolazy']
    if (inspectEnv === '1' || inspectEnv === 'true') runExecArgv.push(`--inspect=${inspectPort}`)
    else if (inspectEnv === 'brk' || inspectEnv === 'break') runExecArgv.push(`--inspect-brk=${inspectPort}`)

    const serverOptions: ServerOptions = {
      // When not debugging the extension host, still allow inspector if env is set
      run:   { module: serverModule, transport: TransportKind.stdio, options: runExecArgv.length > 1 ? { execArgv: runExecArgv } : undefined },
      // In real debug sessions, use 6009 by default (unchanged)
      debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv: ['--nolazy', '--inspect=6009'] } }
    }

    const clientOptions: LanguageClientOptions = {
      // Match both the language id and the file extension to avoid missing didOpen/didChange
      documentSelector: [{ language: 'vivafolio-mock' }, { pattern: '**/*.viv' }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.viv')
      }
    }

    client = new LanguageClient('vivafolioMockLanguage', 'Vivafolio Mock Language Server', serverOptions, clientOptions)
    await client.start()
  } catch (err) {
    console.error('Failed to start Vivafolio Mock Language server:', err)
  }
}

export async function deactivate(): Promise<void> {
  try { await client?.stop() } catch {}
}


