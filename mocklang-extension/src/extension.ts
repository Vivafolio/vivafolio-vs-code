import * as path from 'path'
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node'

let client: LanguageClient | undefined

export async function activate(_context: vscode.ExtensionContext) {
  try {
    console.log('Mocklang extension activating...')
    const serverModule = path.resolve(__dirname, '../../test/mock-lsp-server.js')
    console.log('LSP server module path:', serverModule)

    const serverOptions: ServerOptions = {
      run:   { module: serverModule, transport: TransportKind.stdio },
      debug: { module: serverModule, transport: TransportKind.stdio, options: { execArgv: ['--nolazy', '--inspect-brk=6009'] } }
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: [{ language: 'mocklang' }],
      synchronize: {
        fileEvents: vscode.workspace.createFileSystemWatcher('**/*.mocklang')
      }
    }

    client = new LanguageClient('mocklangLSP', 'Mocklang Language Server', serverOptions, clientOptions)
    console.log('Starting Mocklang Language Client...')
    await client.start()
    console.log('Mocklang Language Client started successfully')
  } catch (err) {
    console.error('Failed to start Mocklang Language server:', err)
  }
}

export async function deactivate(): Promise<void> {
  try { await client?.stop() } catch {}
}


