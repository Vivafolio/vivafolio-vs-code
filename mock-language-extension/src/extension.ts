import * as path from 'path'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export async function activate(_context: vscode.ExtensionContext) {
  try {
    const serverModule = path.resolve(__dirname, '../../test/mock-lsp-server.js')
    const serverOptions: ServerOptions = {
      run:   { module: serverModule, transport: TransportKind.stdio },
      debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv: ['--nolazy', '--inspect=6009'] } }
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ language: 'vivafolio-mock' }],
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


