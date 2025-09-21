import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { IndexingService, IndexingServiceConfig } from '../packages/indexing-service/dist/index'
import { BlockResourcesCache } from '../packages/block-resources-cache/dist/index'
import { VivafolioBlockLoader } from '../packages/block-loader/dist/cjs/index'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node'

// Vivafolio: inline webview widgets triggered by specially-formatted Hint diagnostics.
// Diagnostic message format (language-agnostic):
//   "vivafolio: { ...json viewstate... }" or code='vivafolio' with JSON in message
// When detected, we create an inset at the diagnostic's line and post initState.

let lastMessage: any | undefined
const messageLog: any[] = []
let lastPayload: any | undefined
let lastPosted: any | undefined
let lastPost: undefined | { post: (m: any) => void }
let pickerPost: undefined | { post: (m: any) => void }
let usedInset: boolean = false
let lastInsetLine: number | undefined
const webviewsByBlockId = new Map<string, { post: (m: any) => void, dispose: () => void, line: number, docPath: string }>()

// Block Protocol infrastructure
let indexingService: IndexingService | undefined
let blockResourcesCache: BlockResourcesCache | undefined
let blockLoader: VivafolioBlockLoader | undefined

// LSP client
let languageClient: LanguageClient | undefined

// Logging infra: OutputChannel + optional file logging (enable with VIVAFOLIO_DEBUG=1 or VIVAFOLIO_LOG_TO_FILE=1)
let outputChannel: vscode.OutputChannel | undefined
let logFilePath: string | undefined
const logToFileEnabled: boolean = (typeof process !== 'undefined' && process?.env?.VIVAFOLIO_DEBUG === '1') || (typeof process !== 'undefined' && process?.env?.VIVAFOLIO_LOG_TO_FILE === '1')
const captureWebviewLogs: boolean = (typeof process !== 'undefined' && process?.env?.VIVAFOLIO_CAPTURE_WEBVIEW_LOGS === '1')

// Initialize Block Protocol infrastructure
async function initializeBlockProtocolInfrastructure(context: vscode.ExtensionContext): Promise<void> {
  try {
    logLine('info', 'Initializing Block Protocol infrastructure...')

    // Initialize block resources cache
    blockResourcesCache = new BlockResourcesCache({
      cacheDir: path.join(context.globalStorageUri?.fsPath || context.extensionPath, 'block-cache'),
      maxSize: 100 * 1024 * 1024, // 100MB
      ttl: 24 * 60 * 60 * 1000 // 24 hours
    })

    // Initialize indexing service
    const workspaceFolders = vscode.workspace.workspaceFolders
    const watchPaths = workspaceFolders ? workspaceFolders.map(f => f.uri.fsPath) : []

    const indexingConfig: IndexingServiceConfig = {
      watchPaths,
      supportedExtensions: ['.md', '.csv', '.viv'],
      excludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
    }

    indexingService = new IndexingService(indexingConfig)

    // Set up event listeners for indexing service
    indexingService.on('entity-updated', (event: any) => {
      logLine('info', `Entity updated: ${event.entityId}`)
      broadcastToWebviews({
        type: 'graph:update',
        payload: {
          entities: [{
            entityId: event.entityId,
            ...event.properties
          }],
          links: []
        }
      })
    })

    indexingService.on('entity-created', (event: any) => {
      logLine('info', `Entity created: ${event.entityId}`)
      broadcastToWebviews({
        type: 'graph:update',
        payload: {
          entities: [{
            entityId: event.entityId,
            ...event.properties
          }],
          links: []
        }
      })
    })

    indexingService.on('entity-deleted', (event: any) => {
      logLine('info', `Entity deleted: ${event.entityId}`)
      broadcastToWebviews({
        type: 'graph:delete',
        payload: {
          entityIds: [event.entityId]
        }
      })
    })

    // Start indexing service
    await indexingService.start()
    logLine('info', 'Indexing service started')

    // Block loader will be created on-demand when processing diagnostics
    // since it requires a VivafolioBlockNotification

    // Initialize LSP client for language server integration
    await initializeLanguageClient(context)

    logLine('info', 'Block Protocol infrastructure initialized successfully')

  } catch (error) {
    logLine('error', `Failed to initialize Block Protocol infrastructure: ${error}`)
  }
}


// Handle Block Protocol messages from webviews via VS Code messaging
async function handleBlockProtocolMessage(message: any, webview: vscode.Webview): Promise<void> {
  try {
    logLine('info', `Received Block Protocol message: ${message.type} with payload: ${JSON.stringify(message.payload)}`)

    switch (message.type) {
      case 'graph:update':
        if (message.payload?.entities?.[0]) {
          const entity = message.payload.entities[0]
          const success = await indexingService?.updateEntity(entity.entityId, entity) ?? false
          if (success) {
            logLine('info', `Entity ${entity.entityId} updated successfully`)
            // Broadcast the update to other webviews
            broadcastToWebviews(message, webview)

            // Update the source code if this is a color change
            if (entity.properties?.color && entity.entityId === 'color-picker') {
              logLine('info', `Updating source code with new color: ${entity.properties.color}`)
              await applyColorMarker(JSON.stringify(entity.properties), entity.entityId)
            }
          } else {
            logLine('error', `Failed to update entity ${entity.entityId}`)
          }
        }
        break

      case 'graph:create':
        if (message.payload?.entities?.[0]) {
          const entity = message.payload.entities[0]
          // For now, assume CSV source type for new entities
          const success = await indexingService?.createEntity(entity.entityId, entity, { sourceType: 'csv' }) ?? false
          if (success) {
            logLine('info', `Entity ${entity.entityId} created successfully`)
            // Broadcast the creation to other webviews
            broadcastToWebviews(message, webview)
          } else {
            logLine('error', `Failed to create entity ${entity.entityId}`)
          }
        }
        break

      case 'graph:delete':
        if (message.payload?.entityIds?.[0]) {
          const entityId = message.payload.entityIds[0]
          const success = await indexingService?.deleteEntity(entityId) ?? false
          if (success) {
            logLine('info', `Entity ${entityId} deleted successfully`)
            // Broadcast the deletion to other webviews
            broadcastToWebviews(message, webview)
          } else {
            logLine('error', `Failed to delete entity ${entityId}`)
          }
        }
        break

      case 'graph:query':
        const entities = indexingService?.getAllEntities() ?? []
        const formattedEntities = entities.map((e: any) => ({
          entityId: e.entityId,
          ...e.properties
        }))
        logLine('info', `Responding to graph:query with ${entities.length} entities: ${JSON.stringify(formattedEntities)}`)
        webview.postMessage({
          type: 'graph:update',
          payload: {
            entities: formattedEntities,
            links: []
          }
        })
        break

      case 'log':
        // Handle webview log messages when capture is enabled
        const level = message.level || 'info'
        const text = `[WEBVIEW] ${message.text || ''}`
        logLine(level, text)
        break

      case 'ready':
        // Block is ready - acknowledge
        logLine('info', `Block ready message received`)
        break

      default:
        logLine('warn', `Unknown message type: ${message.type}`)
    }
  } catch (error) {
    logLine('error', `Error handling Block Protocol message: ${error}`)
  }
}

// Initialize LSP client for language server integration
async function initializeLanguageClient(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Check if mocklang extension is available (for testing)
    const mockLangExt = vscode.extensions.getExtension('local.mocklang-extension')
    if (mockLangExt) {
      logLine('info', 'Mocklang extension found, LSP integration enabled')
      // The mock extension handles its own LSP client
      return
    }

    // For production, we would configure real language servers here
    // For now, we'll rely on external LSP servers or the mock extension

    logLine('info', 'LSP client initialization skipped (no language servers configured)')
  } catch (error) {
    logLine('error', `Failed to initialize LSP client: ${error}`)
  }
}

// Broadcast Block Protocol message to all connected webviews (except sender)
function broadcastToWebviews(message: any, excludeWebview?: vscode.Webview): void {
  for (const [blockId, webviewInfo] of webviewsByBlockId.entries()) {
    try {
      if (excludeWebview && webviewInfo.post === excludeWebview.postMessage) {
        continue // Skip the sender
      }
      webviewInfo.post(message)
    } catch (error) {
      logLine('error', `Error broadcasting to webview ${blockId}: ${error}`)
      // Remove failed webview
      webviewsByBlockId.delete(blockId)
    }
  }
}

// Convert diagnostic payload to VivafolioBlock notification format
function createVivafolioBlockNotification(payload: any, document: vscode.TextDocument, diagnostic: vscode.Diagnostic): any {
  try {
    // The payload from the LSP server should already be a complete VivafolioBlock notification
    // We just need to ensure it has the correct sourceUri and range from the diagnostic
    const notification = {
      ...payload,
      sourceUri: document.uri.toString(),
      range: {
        start: {
          line: diagnostic.range.start.line,
          character: diagnostic.range.start.character
        },
        end: {
          line: diagnostic.range.end.line,
          character: diagnostic.range.end.character
        }
      }
    }

    logLine('info', `Created VivafolioBlock notification: ${notification.blockId} (${notification.blockType})`)
    return notification
  } catch (error) {
    logLine('error', `Failed to create VivafolioBlock notification: ${error}`)
    return null
  }
}

// Render Block Protocol block using the block loader
async function renderBlockProtocolBlock(notification: any, line: number, container?: HTMLElement): Promise<void> {
  try {
    if (!blockResourcesCache) {
      logLine('error', 'Block resources cache not initialized')
      return
    }

    // Create a block loader instance for this specific block
    const blockLoader = new VivafolioBlockLoader(notification, {
      resourcesCache: blockResourcesCache,
      enableIntegrityChecking: true
    })

    // Add block entities to indexing service so webview can query them
    if (notification.entityGraph?.entities) {
      logLine('info', `Adding ${notification.entityGraph.entities.length} entities to indexing service`)
      for (const entity of notification.entityGraph.entities) {
        await indexingService?.createEntity(entity.entityId, entity, { sourceType: 'lsp' })
        logLine('info', `Added entity ${entity.entityId} to indexing service`)
      }
    }

    // Create webview HTML that will load the block
    const blockHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    .block-container { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="block-container" class="block-container"></div>
  <script>
    // VS Code webview messaging for Block Protocol
    console.log('[WEBVIEW] Template script starting');
    const vscode = acquireVsCodeApi();
    console.log('[WEBVIEW] acquireVsCodeApi() called');

    // Request initial entity data on load
    console.log('[WEBVIEW] Sending graph:query');
    vscode.postMessage({ type: 'graph:query' });
    console.log('[WEBVIEW] graph:query sent');

    // Listen for messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      vscode.postMessage({ type: 'log', level: 'info', text: 'Received VS Code message: ' + JSON.stringify(message) });

      // Forward messages to block loader if needed
      if (window.vivafolioBlockLoader) {
        window.vivafolioBlockLoader.handleMessage(message);
      }
    });

    // Global function for block loader to send messages
    window.vivafolioSendMessage = (message) => {
      vscode.postMessage(message);
    };

    console.log('Block Protocol webview initialized');
  </script>
</body>
</html>`

    // Load block HTML content
    let blockContent = '<div>Block loading...</div>'
    if (notification.resources) {
      const htmlResource = notification.resources.find((r: any) => r.logicalName === 'app.html')
      if (htmlResource && htmlResource.physicalPath) {
        try {
          const fs = require('fs')
          const filePath = htmlResource.physicalPath.replace('file://', '')
          blockContent = fs.readFileSync(filePath, 'utf8')
          logLine('info', `Pre-loaded block HTML from ${filePath}`)
        } catch (fileError) {
          logLine('error', `Failed to pre-load block HTML file: ${fileError}`)
        }
      }
    }

    const finalHtml = blockHtml.replace(
      '<div id="block-container" class="block-container"></div>',
      `<div id="block-container" class="block-container">${blockContent}</div>`
    )

    // Create webview inset
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const forcePanel = process?.env?.VIVAFOLIO_FORCE_PANEL === '1'
    const createInsetRaw = (vscode.window as any).createWebviewTextEditorInset as undefined | ((editor: vscode.TextEditor, line: number, height: number, opts?: any)=>any)
    const createInset = forcePanel ? undefined : createInsetRaw
    const initialHeight = computeDefaultInsetHeight(editor)

    if (typeof createInset === 'function') {
      usedInset = true
      lastInsetLine = line

      const inset = createInset(editor, line, initialHeight, { enableScripts: true, localResourceRoots: [] })

      // Set the complete HTML with block content
      inset.webview.html = finalHtml

      const onMessage = async (msg: any) => {
        // Handle Block Protocol messages
        await handleBlockProtocolMessage(msg, inset.webview)
      }

      inset.webview.onDidReceiveMessage(onMessage)

      const postFunc = { post: (m: any) => { try { inset.webview.postMessage(m) } catch {} } }
      lastPost = postFunc
      if (notification.blockId) {
        try {
          webviewsByBlockId.set(notification.blockId, {
            post: postFunc.post.bind(postFunc),
            dispose: () => { try { (inset as any).dispose?.() } catch {} },
            line: line,
            docPath: editor.document.uri.fsPath
          })
        } catch {}
      }

      inset.webview.html = finalHtml

      // Proactively send initial entity data to avoid race on 'ready'
      try {
        if (notification.entityGraph !== undefined) {
          const payload = { entities: notification.entityGraph?.entities ?? [], links: notification.entityGraph?.links ?? [] }
          const msg = { type: 'graph:update', payload }
          lastPosted = msg
          // slight delay to let the webview load its script
          setTimeout(() => { try { postFunc.post(msg) } catch {} }, 0)
        }
      } catch {}

    } else {
      // Fallback to panel
      const panel = vscode.window.createWebviewPanel('vivafolio.blockprotocol', 'Vivafolio Block', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true })
      panel.webview.onDidReceiveMessage(async (msg: any) => {
        if (msg?.type === 'ready') {
          try {
            // Load block using block loader
            const blockElement = await blockLoader.loadBlock(notification, document.createElement('div'))
            panel.webview.html = finalHtml.replace(
              '<div id="block-container" class="block-container"></div>',
              blockElement.outerHTML
            )
          } catch (error) {
            logLine('error', `Failed to load block: ${error}`)
          }
        } else {
          // Handle Block Protocol messages
          await handleBlockProtocolMessage(msg, panel.webview)
        }
      })

      const postFunc = { post: (m: any) => { try { panel.webview.postMessage(m) } catch {} } }
      lastPost = postFunc
      if (notification.blockId) {
        try {
          webviewsByBlockId.set(notification.blockId, {
            post: postFunc.post.bind(postFunc),
            dispose: () => { try { panel.dispose() } catch {} },
            line: line,
            docPath: editor.document.uri.fsPath
          })
        } catch {}
      }

      panel.webview.html = finalHtml
    }

    logLine('info', `Rendered Block Protocol block: ${notification.blockId}`)
  } catch (error) {
    logLine('error', `Failed to render Block Protocol block: ${error}`)
  }
}

function logLine(level: 'info' | 'warn' | 'error', message: string) {
  try {
    const ts = new Date().toISOString()
    const line = `${ts} [${level.toUpperCase()}] ${message}`
    try { outputChannel?.appendLine(line) } catch {}
    if (logToFileEnabled && logFilePath) {
      try { fs.appendFileSync(logFilePath, line + '\n') } catch {}
    }
  } catch {}
}

function computeDefaultInsetHeight(editor: vscode.TextEditor): number {
  try {
    const cfg = vscode.workspace.getConfiguration('editor', editor.document.uri)
    const fontSize = Math.max(8, Number(cfg.get<number>('fontSize', 14)) || 14)
    const lineHeightCfg = Number(cfg.get<number>('lineHeight', 0)) || 0
    const approx = lineHeightCfg > 0 ? lineHeightCfg : Math.ceil(fontSize * 1.4)
    return Math.max(12, Math.min(approx, 800))
  } catch {
    return 24
  }
}

function injectAutoResize(html: string): string {
  try {
    const script = `
<script>
(function(){
  function post(msg){ try { const api = (typeof acquireVsCodeApi==='function')?acquireVsCodeApi():undefined; if(api&&api.postMessage){ api.postMessage(msg) } else if(window.parent){ window.parent.postMessage(msg,'*') } } catch(e){}
  }
  function report(){ try { const h = Math.ceil(document.documentElement.scrollHeight||document.body.scrollHeight||0); if(h&&isFinite(h)) post({type:'resize', height:h}) } catch(e){}
  }
  try { const ro = new ResizeObserver(()=>report()); ro.observe(document.documentElement); setTimeout(report,0) } catch(e){}
  try { window.addEventListener('load', ()=>setTimeout(report,0)) } catch(e){}
})()
</script>
<script>
(function(){
  var CAPTURE = ${captureWebviewLogs ? 'true' : 'false'};
  if(!CAPTURE) return;
  try {
    var api = (typeof acquireVsCodeApi==='function')?acquireVsCodeApi():undefined;
    function send(level, args){
      try {
        var text = (args||[]).map(function(a){ try { return (typeof a==='string')?a:JSON.stringify(a) } catch(e){ return String(a) } }).join(' ');
        var msg = { type:'log', level: String(level||'info'), text: text, ts: Date.now() };
        if(api&&api.postMessage){ api.postMessage(msg) } else if(window.parent){ window.parent.postMessage(msg,'*') }
      } catch(e){}
    }
    var origLog = console.log.bind(console);
    var origWarn = console.warn.bind(console);
    var origErr = console.error.bind(console);
    console.log = function(){ try { send('info', Array.prototype.slice.call(arguments)) } catch(e){}; try { origLog.apply(console, arguments) } catch(e){} };
    console.warn = function(){ try { send('warn', Array.prototype.slice.call(arguments)) } catch(e){}; try { origWarn.apply(console, arguments) } catch(e){} };
    console.error = function(){ try { send('error', Array.prototype.slice.call(arguments)) } catch(e){}; try { origErr.apply(console, arguments) } catch(e){} };
  } catch(e){}
})()
</script>`
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, script + '\n</head>')
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, script + '\n</body>')
    return html + script
  } catch {
    return html
  }
}

async function renderInset(line: number, html?: string, init?: any, entityGraph?: any, blockId?: string) {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  const forcePanel = process?.env?.VIVAFOLIO_FORCE_PANEL === '1'
  const createInsetRaw = (vscode.window as any).createWebviewTextEditorInset as undefined | ((editor: vscode.TextEditor, line: number, height: number, opts?: any)=>any)
  const createInset = forcePanel ? undefined : createInsetRaw
  const initialHeight = Math.max(12, Math.min(Number(init?.height) || computeDefaultInsetHeight(editor), 2000))
  const htmlFinal = injectAutoResize(html ?? `<!DOCTYPE html><html><body><div>Vivafolio</div><script>try{(typeof acquireVsCodeApi==='function'&&acquireVsCodeApi().postMessage)?acquireVsCodeApi().postMessage({type:'ready'}):window.parent.postMessage({type:'ready'},'*')}catch(e){}</script></body></html>`) 
  let updateHeight: undefined | ((h: number) => void)
  try {
    console.log('[Vivafolio] renderInset start', JSON.stringify({ line, forcePanel, hasCreateInset: typeof createInset === 'function', hasEntityGraph: !!entityGraph }))
  } catch {}
  const onMessage = async (msg: any) => {
    lastMessage = msg
    try { messageLog.push(msg); if (messageLog.length > 50) messageLog.shift() } catch {}

    if (msg?.type === 'graph:update') {
      logLine('info', `Extension received graph:update: ${JSON.stringify(msg)}`)
      console.log('Extension received graph:update:', JSON.stringify(msg))
      try {
        const entity = msg?.payload?.entities?.[0]
        const entityId = entity?.entityId
        console.log('Extension processing entityId:', entityId, 'properties:', JSON.stringify(entity?.properties))

        if (entity && entity.properties) {
          // Treat component state as opaque - use exactly what the component provides
          // Each Vivafolio component decides its own state encoding format
          // Extension should not parse, modify, or restructure the component's state
          const completeJsonString = JSON.stringify(entity.properties)
          console.log('Extension received component state:', completeJsonString)

          console.log('Extension calling applyColorMarker with complete JSON:', completeJsonString, 'entityId:', entityId)
          await applyColorMarker(completeJsonString, entityId)
          console.log('Extension applyColorMarker completed')
        } else {
          console.log('Extension: no valid entity or properties found in message')
        }
      } catch (e) {
        console.log('Error processing graph:update:', e)
      }
    } else if (msg?.type === 'log') {
      try { logLine('info', `[WEBVIEW] ${String(msg?.text ?? '')}`) } catch {}
    } else {
      console.log('Extension received message:', msg)
    }
    if (msg?.type === 'ready' && entityGraph !== undefined) {
      try {
        const payload = { entities: entityGraph?.entities ?? [], links: entityGraph?.links ?? [] }
        lastPosted = { type: 'graph:update', payload }
        lastPost?.post(lastPosted)
      } catch {}
    }
    if (msg?.type === 'graph:query' && entityGraph !== undefined) {
      try {
        const payload = { entities: entityGraph?.entities ?? [], links: entityGraph?.links ?? [] }
        const queryResponse = { type: 'graph:update', payload }
        lastPosted = queryResponse
        lastPost?.post(queryResponse)
        logLine('info', 'Responded to graph:query with entity data')
      } catch {}
    }
    if (msg?.type === 'resize' && typeof msg.height === 'number') {
      try { updateHeight?.(Math.max(12, Math.min(Math.ceil(Number(msg.height)), 2000))) } catch {}
      return
    }
  }
  // Check if this is a picker webview by looking at the HTML content
  const isPicker = (html ?? '').includes('color-picker')

  if (typeof createInset === 'function') {
    usedInset = true
    lastInsetLine = line
    const inset = createInset(editor, line, initialHeight, { enableScripts: true })
    updateHeight = (h: number) => { try { inset.updateHeight(h) } catch {} }
    inset.webview.onDidReceiveMessage(onMessage)
    const postFunc = { post: (m: any) => { try { inset.webview.postMessage(m) } catch {} } }
    lastPost = postFunc
    if (isPicker) pickerPost = postFunc
    try { console.log('[Vivafolio] setting inset.webview.html (inset path), isPicker=', isPicker) } catch {}
    inset.webview.html = htmlFinal
    // Proactively post entityGraph to the newly created webview to avoid race on 'ready'
    try {
      if (entityGraph !== undefined) {
        const payload = { entities: entityGraph?.entities ?? [], links: entityGraph?.links ?? [] }
        const msg = { type: 'graph:update', payload }
        lastPosted = msg
        // slight delay to let the webview load its script
        setTimeout(() => { try { postFunc.post(msg) } catch {} }, 0)
      }
    } catch {}
    if (blockId) {
      try {
        webviewsByBlockId.set(blockId, {
          post: postFunc.post.bind(postFunc),
          dispose: () => { try { (inset as any).dispose?.() } catch {} },
          line: line,
          docPath: editor.document.uri.fsPath
        })
      } catch {}
    }
    if (init !== undefined) { lastPosted = { type: 'initState', viewstate: init }; lastPost.post(lastPosted) }
  } else {
    const panel = vscode.window.createWebviewPanel('vivafolio.inline.fallback', 'Vivafolio', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true })
    panel.webview.onDidReceiveMessage(onMessage)
    const postFunc = { post: (m: any) => { try { panel.webview.postMessage(m) } catch {} } }
    lastPost = postFunc
    if (isPicker) pickerPost = postFunc
    try { console.log('[Vivafolio] setting panel.webview.html (fallback path), isPicker=', isPicker) } catch {}
    panel.webview.html = htmlFinal
    // Proactively post entityGraph to the newly created webview to avoid race on 'ready'
    try {
      if (entityGraph !== undefined) {
        const payload = { entities: entityGraph?.entities ?? [], links: entityGraph?.links ?? [] }
        const msg = { type: 'graph:update', payload }
        lastPosted = msg
        setTimeout(() => { try { postFunc.post(msg) } catch {} }, 0)
      }
    } catch {}
    if (blockId) {
      try {
        webviewsByBlockId.set(blockId, {
          post: postFunc.post.bind(postFunc),
          dispose: () => { try { panel.dispose() } catch {} },
          line: line,
          docPath: editor.document.uri.fsPath
        })
      } catch {}
    }
    if (init !== undefined) { lastPosted = { type: 'initState', viewstate: init }; lastPost.post(lastPosted) }
  }
  try { console.log('[Vivafolio] renderInset end') } catch {}
}
async function applyColorMarker(completeJsonString: string, entityId?: string): Promise<void> {
  console.log('applyColorMarker called with complete JSON:', completeJsonString, 'entityId:', entityId)
  try {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      console.log('applyColorMarker: no active editor')
      return
    }
    console.log('applyColorMarker: active editor found')

    const doc = editor.document

    // Check if this is a supported file (language-specific syntax)
    // Accept vivafolio (production), vivafolio-mock (old test), and mocklang (new test) languages
    if (doc.languageId !== 'vivafolio' && doc.languageId !== 'vivafolio-mock' && doc.languageId !== 'mocklang') {
      console.log('applyColorMarker: skipping - not a supported file (language:', doc.languageId + ')')
      return
    }

    let targetLineIdx = -1

    // Find the line with the vivafolio block that should be updated
    // For now, we look for the picker line, but this could be made more generic
    const lineCount = doc.lineCount
    for (let i = 0; i < lineCount; i++) {
      const lineText = doc.lineAt(i).text
      if (lineText.includes('vivafolio_picker!')) {
        targetLineIdx = i;
        console.log('applyColorMarker: found picker at line', i)
        break
      }
    }

    if (targetLineIdx < 0) {
      console.log('applyColorMarker: no target line found')
      return
    }

    const range = doc.lineAt(targetLineIdx).range
    let lineText = doc.getText(range)
    console.log('applyColorMarker: target line text:', lineText)

    // Check for corrupted gui_state (multiple concatenated blocks or corrupted patterns)
    const guiStateMatches = lineText.match(/gui_state!/g)
    const hasMultipleGuiState = guiStateMatches && guiStateMatches.length > 1

    // Check if there are unmatched quotes/hashes that indicate corruption
    const quoteCount = (lineText.match(/"/g) || []).length
    const hashCount = (lineText.match(/#/g) || []).length
    const rHashCount = (lineText.match(/r#/g) || []).length

    // Clean gui_state syntax analysis:
    // vivafolio_picker!() gui_state! r#"{"color":"#ff0000"}"#
    // - Quotes: r#", {"color":", "#ff0000", "}, "#
    // - Hashes: r#, #ff0000, #
    // - r#: r#
    // Clean should have: quotes >= 4, hashes >= 3, r# = 1
    // Corrupted has significantly more due to concatenated blocks
    const hasUnmatchedSyntax = quoteCount > 6 || hashCount > 4 || rHashCount > 1

    const hasCorruptedContent = hasUnmatchedSyntax

    if (hasMultipleGuiState || hasCorruptedContent) {
      console.log('applyColorMarker: detected corrupted gui_state, cleaning up...')
      console.log('applyColorMarker: multiple gui_state:', hasMultipleGuiState)
      console.log('applyColorMarker: corrupted content:', hasCorruptedContent)
      // Extract everything before the first gui_state!
      const beforeGuiState = lineText.split('gui_state!')[0]
      lineText = beforeGuiState.trim()
      console.log('applyColorMarker: cleaned line:', lineText)
    }

    // Simple find and replace: replace entire gui_state! block with new JSON string
    // Use a more robust regex that handles the viv language syntax: gui_state! r#"..."#
    // Make it greedy to match to the last "# on the line (handles any remaining corruption)
    let newText = lineText.replace(/gui_state!\s*r#".*"#/, `gui_state! r#"${completeJsonString}"#`)

    // If no gui_state found, append it
    if (!newText.includes('gui_state!')) {
      newText = lineText + ' ' + `gui_state! r#"${completeJsonString}"#`
      console.log('applyColorMarker: appended new gui_state')
    }

    console.log('applyColorMarker: replacing line with:', newText)

    const edit = new vscode.WorkspaceEdit()
    edit.replace(doc.uri, range, newText)
    const success = await vscode.workspace.applyEdit(edit)
    if (success) {
      console.log('applyColorMarker: edit applied, saving...')
      await doc.save()
      console.log('applyColorMarker: document saved')
    } else {
      console.log('applyColorMarker: edit failed')
    }
  } catch (e) {
    console.log('applyColorMarker: error:', e)
  }
}

function parseVivafolioPayload(diag: vscode.Diagnostic): any | undefined {
  try {
    const codeVal = typeof diag.code === 'string' ? diag.code : (typeof diag.code === 'object' && diag.code ? String((diag.code as any).value) : undefined)
    const msg = diag.message
    const m = /vivafolio:\s*(\{[\s\S]*\})/i.exec(msg)
    const jsonStr = m?.[1]
    if (jsonStr) return JSON.parse(jsonStr)
    if (codeVal && codeVal.toLowerCase() === 'vivafolio') {
      // Try whole message as JSON
      try { return JSON.parse(msg) } catch {}
    }
  } catch {}
  return undefined
}

async function readHtmlFromResources(payload: any): Promise<string | undefined> {
  try {
    const res = Array.isArray(payload?.resources) ? payload.resources[0] : undefined
    const p = res?.physicalPath ? String(res.physicalPath) : undefined
    if (!p) return undefined
    const filePath = p.startsWith('file://') ? vscode.Uri.parse(p).fsPath : p
    const data = await fs.promises.readFile(filePath, 'utf8')
    return data
  } catch { return undefined }
}

async function executeRuntimeFile(filePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath).toLowerCase()
    let command: string
    let args: string[]

    switch (ext) {
      case '.py':
        command = 'python3'
        args = [filePath]
        break
      case '.rb':
        command = 'ruby'
        args = [filePath]
        break
      case '.jl':
        command = 'julia'
        args = [filePath]
        break
      case '.r':
        command = 'Rscript'
        args = [filePath]
        break
      case '.js':
        command = 'node'
        args = [filePath]
        break
      default:
        reject(new Error(`Unsupported file type: ${ext}. Supported: .py, .rb, .jl, .r, .js`))
        return
    }

    console.log('[Vivafolio] Executing runtime file:', command, args.join(' '))

    const child = spawn(command, args, {
      cwd: path.dirname(filePath),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Execution failed with code ${code}: ${stderr}`))
        return
      }

      // Split stdout into lines and filter for JSON lines
      const lines = stdout.split('\n').filter(line => line.trim())
      console.log('[Vivafolio] Execution completed, captured lines:', lines.length)
      resolve(lines)
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

function parseRuntimeVivafolioBlock(lines: string[]): any[] {
  const notifications: any[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.trim())
      // Validate it's a VivafolioBlock notification
      if (parsed && typeof parsed === 'object' &&
          parsed.blockId && parsed.blockType && parsed.entityGraph) {
        notifications.push(parsed)
        console.log('[Vivafolio] Parsed VivafolioBlock notification:', parsed.blockId)
      }
    } catch (e) {
      // Skip non-JSON lines
      console.log('[Vivafolio] Skipping non-JSON line:', line.substring(0, 100))
    }
  }

  return notifications
}

function convertVivafolioBlockToDiagnostics(notifications: any[], document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = []

  for (const notification of notifications) {
    // Create a diagnostic at line 0 (will be updated by the main logic)
    const range = new vscode.Range(0, 0, 0, 0)
    const diagnostic = new vscode.Diagnostic(
      range,
      `vivafolio: ${JSON.stringify(notification)}`,
      vscode.DiagnosticSeverity.Hint
    )
    diagnostic.code = 'vivafolio'
    diagnostics.push(diagnostic)
  }

  return diagnostics
}

// Auto-hide logic per language
function updateAutoHide(editor: vscode.TextEditor | undefined) {
  if (!editor) return
  const lang = editor.document.languageId
  const ranges: vscode.Range[] = []
  try {
    const text = editor.document.getText()
    if (lang === 'lean4' || editor.document.uri.fsPath.endsWith('.lean')) {
      // Hide gui_state! r#"..."# blocks
      const re = /gui_state!\s*r#"([\s\S]*?)"#/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        const start = m.index
        const end = m.index + m[0].length
        ranges.push(new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end)))
      }
    } else if (lang === 'nim' || editor.document.uri.fsPath.endsWith('.nim')) {
      // Hide Nim block comments with a sentinel, e.g., #[[ VIVAFOLIO_STATE ... ]]# or ##[ VIVAFOLIO_STATE ]##
      const re = /#\[\[\s*VIVAFOLIO_STATE[\s\S]*?\]\]#|##\[\s*VIVAFOLIO_STATE[\s\S]*?\]##/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        ranges.push(new vscode.Range(editor.document.positionAt(m.index), editor.document.positionAt(m.index + m[0].length)))
      }
    }
  } catch {}
  editor.setDecorations(hiddenDecoration, ranges)
}

let hiddenDecoration: vscode.TextEditorDecorationType

export function activate(context: vscode.ExtensionContext) {
  // Initialize OutputChannel and optional log file
  try {
    outputChannel = vscode.window.createOutputChannel('Vivafolio')
    context.subscriptions.push(outputChannel)
    outputChannel.appendLine(`[Vivafolio] OutputChannel initialized at ${new Date().toISOString()}`)
    if (logToFileEnabled) {
      const logDir = path.join(context.globalStorageUri?.fsPath || context.extensionPath, 'logs')
      try { fs.mkdirSync(logDir, { recursive: true }) } catch {}
      logFilePath = path.join(logDir, `vivafolio-${Date.now()}.log`)
      try { fs.appendFileSync(logFilePath, `[Vivafolio] Log file created at ${new Date().toISOString()}\n`) } catch {}
      outputChannel.appendLine(`[Vivafolio] File logging enabled at: ${logFilePath}`)
    }
  } catch {}
  hiddenDecoration = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; opacity: 0;' })
  context.subscriptions.push(hiddenDecoration)

  // Initialize Block Protocol infrastructure
  initializeBlockProtocolInfrastructure(context)

  const diagnostics = vscode.languages.createDiagnosticCollection()
  context.subscriptions.push(diagnostics)

  // Helper: process current diagnostics for the active editor (handles races where
  // diagnostics arrive before our change listener runs)
  async function processCurrentDiagnosticsForActiveEditor() {
    try {
      const active = vscode.window.activeTextEditor
      if (!active) return
      const uri = active.document.uri
      const all = vscode.languages.getDiagnostics(uri)
      const hints = all.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)

      // Collect all blockIds present in current diagnostics (complete state)
      const currentBlockIds = new Set<string>()
      for (const d of hints) {
        const payload = parseVivafolioPayload(d)
        if (payload?.blockId) currentBlockIds.add(String(payload.blockId))
      }

      // If no hints at all, clear all webviews for this document
      if (hints.length === 0) {
        for (const [blockId, webviewInfo] of webviewsByBlockId.entries()) {
          try { webviewInfo.dispose() } catch {}
        }
        webviewsByBlockId.clear()
        return
      }

      // Remove webviews for blockIds that are no longer present (stale insets)
      for (const [blockId, webviewInfo] of webviewsByBlockId.entries()) {
        if (!currentBlockIds.has(blockId)) {
          try { webviewInfo.dispose(); webviewsByBlockId.delete(blockId) } catch {}
        }
      }

      // Process current diagnostics: update existing or create new insets
      for (const d of hints) {
        const payload = parseVivafolioPayload(d)
        if (!payload) continue
        const line = Math.max(0, Math.min((d.range?.start?.line ?? 0), active.document.lineCount - 1))
        lastPayload = payload
        const viewstate = payload?.viewstate ?? payload?.state ?? undefined
        void (async () => {
          try {
            if (payload?.error) {
              lastPosted = { type: 'graph:error', error: payload.error }
              const existing = payload?.blockId ? webviewsByBlockId.get(String(payload.blockId)) : undefined
              try { if (existing) existing.post(lastPosted); else lastPost?.post(lastPosted) } catch {}
            } else {
              const prePayload = { entities: payload?.entityGraph?.entities ?? [], links: payload?.entityGraph?.links ?? [] }
              lastPosted = { type: 'graph:update', payload: prePayload }
              const existing = payload?.blockId ? webviewsByBlockId.get(String(payload.blockId)) : undefined
              try { if (existing) existing.post(lastPosted); else lastPost?.post(lastPosted) } catch {}
            }
          } catch {}
        // Create VivafolioBlock notification from diagnostic payload
        const notification = createVivafolioBlockNotification(payload, active.document, d)
        if (!notification) {
          logLine('error', 'Failed to create VivafolioBlock notification')
          return
        }

        if (notification.blockId && webviewsByBlockId.has(String(notification.blockId))) {
          const existingWebview = webviewsByBlockId.get(String(notification.blockId))
          let isAlive = false
          try { existingWebview?.post({ type: 'ping' }); isAlive = true } catch {}
          if (isAlive) return
          webviewsByBlockId.delete(String(notification.blockId))
        }

        // Create new Block Protocol block
        await renderBlockProtocolBlock(notification, line)
        })()
      }
    } catch {}
  }

  // Listen to all diagnostic changes; trigger on Hints only
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(e => {
    const active = vscode.window.activeTextEditor
    if (!active) return
    const uri = active.document.uri
    const all = vscode.languages.getDiagnostics(uri)
    const hints = all.filter(d => d.severity === vscode.DiagnosticSeverity.Hint)
    try { console.log('[Vivafolio] onDidChangeDiagnostics: total=', all.length, 'hints=', hints.length) } catch {}

    // Collect all blockIds present in current diagnostics (complete state)
    const currentBlockIds = new Set<string>()
    for (const d of hints) {
      const payload = parseVivafolioPayload(d)
      if (payload?.blockId) {
        currentBlockIds.add(String(payload.blockId))
      }
    }

    // If no hints at all, clear all webviews for this document
    if (hints.length === 0) {
      console.log('[Vivafolio] no hints found, clearing all webviews for document')
      for (const [blockId, webviewInfo] of webviewsByBlockId.entries()) {
        try {
          console.log('[Vivafolio] clearing webview for blockId:', blockId)
          webviewInfo.dispose()
        } catch (error) {
          console.log('[Vivafolio] error disposing webview:', error)
        }
      }
      webviewsByBlockId.clear()
      return
    }

    // Remove webviews for blockIds that are no longer present (stale insets)
    for (const [blockId, webviewInfo] of webviewsByBlockId.entries()) {
      if (!currentBlockIds.has(blockId)) {
        try {
          console.log('[Vivafolio] removing stale webview for blockId:', blockId)
          webviewInfo.dispose()
          webviewsByBlockId.delete(blockId)
        } catch (error) {
          console.log('[Vivafolio] error disposing stale webview:', error)
        }
      }
    }

    // Process current diagnostics: update existing or create new insets
    for (const d of hints) {
      const payload = parseVivafolioPayload(d)
      if (!payload) { try { console.log('[Vivafolio] hint without vivafolio payload at line', d.range?.start?.line) } catch {}; continue }
      const line = Math.max(0, Math.min((d.range?.start?.line ?? 0), active.document.lineCount - 1))
      lastPayload = payload
      const viewstate = payload?.viewstate ?? payload?.state ?? undefined
      void (async () => {
        // Precompute initial graph payload; store for tests and post to existing webview if any
        try {
          const prePayload = { entities: payload?.entityGraph?.entities ?? [], links: payload?.entityGraph?.links ?? [] }
          lastPosted = { type: 'graph:update', payload: prePayload }
          // Update existing webview for this blockId if present, else fall back to lastPost
          const existing = payload?.blockId ? webviewsByBlockId.get(String(payload.blockId)) : undefined
          try {
            if (existing) {
              console.log('[Vivafolio] updating existing webview for blockId:', String(payload.blockId))
              existing.post(lastPosted)
            } else {
              lastPost?.post(lastPosted)
            }
          } catch (error) {
            // If posting failed, the webview might be disposed
            if (existing) {
              console.log('[Vivafolio] failed to update webview for blockId:', String(payload.blockId), 'error:', error instanceof Error ? error.message : String(error))
              // Don't remove from tracking here as we'll handle it in the main logic below
            }
          }
        } catch {}
        // Create VivafolioBlock notification from diagnostic payload
        const notification = createVivafolioBlockNotification(payload, active.document, d)
        if (!notification) {
          logLine('error', 'Failed to create VivafolioBlock notification')
          return
        }

        try { console.log('[Vivafolio] rendering Block Protocol block at line', line, 'blockId=', notification.blockId, 'blockType=', notification.blockType) } catch {}

        // If an inset for this block already exists, check if it's still alive
        if (notification.blockId && webviewsByBlockId.has(String(notification.blockId))) {
          const existingWebview = webviewsByBlockId.get(String(notification.blockId))
          // Try to post to check if webview is still alive
          let isAlive = false
          try {
            existingWebview?.post({ type: 'ping' })
            isAlive = true
            console.log('[Vivafolio] reusing existing webview for blockId', String(notification.blockId))
          } catch (error) {
            console.log('[Vivafolio] webview for blockId', String(notification.blockId), 'is disposed, will recreate')
            // Remove the disposed webview from our tracking
            webviewsByBlockId.delete(String(notification.blockId))
          }

          if (isAlive) {
            return // Successfully reused existing webview
          }
          // Fall through to create new webview if disposed
        }

        // Create new Block Protocol block
        console.log('[Vivafolio] creating new Block Protocol block for blockId:', String(notification.blockId))
        await renderBlockProtocolBlock(notification, line)
      })()
    }
  }))

  // Decorations and folding on editor changes
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => { updateAutoHide(e); setTimeout(() => { void processCurrentDiagnosticsForActiveEditor() }, 50) }))
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    const active = vscode.window.activeTextEditor
    if (active && e.document === active.document) updateAutoHide(active)
  }))
  updateAutoHide(vscode.window.activeTextEditor)

  // Handle the race where diagnostics already exist before our listener: process once at activation
  void processCurrentDiagnosticsForActiveEditor()

  // Expose a command for tests to request immediate diagnostic processing
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.processCurrentDiagnostics', async () => {
    await processCurrentDiagnosticsForActiveEditor()
  }))

  // Expose log-related commands for tests and tooling
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.getLogFilePath', () => logFilePath))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.isWebviewLogCaptureEnabled', () => captureWebviewLogs))

  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.showInlineWidget', async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    await renderInset(editor.selection.active.line)
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.getLastMessage', () => lastMessage))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.getMessages', () => [...messageLog]))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.getLastPosted', () => lastPosted))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.getLastPayload', () => lastPayload))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.postToLastWebview', (msg: any) => {
    console.log('Extension: vivafolio.postToLastWebview called with:', JSON.stringify(msg))
    try {
      console.log('Extension: posting message to webview:', JSON.stringify(msg))
      lastPost?.post(msg)
      lastPosted = msg
      console.log('Extension: message posted successfully')
    } catch (e) {
      console.error('Extension: error posting to webview:', e)
    }
  }))

  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.postToPickerWebview', (msg: any) => {
    console.log('Extension: vivafolio.postToPickerWebview called with:', JSON.stringify(msg))
    try {
      console.log('Extension: posting message to picker webview:', JSON.stringify(msg))
      pickerPost?.post(msg)
      lastPosted = msg
      console.log('Extension: message posted to picker successfully')
    } catch (e) {
      console.error('Extension: error posting to picker webview:', e)
    }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.getLastInsetInfo', () => ({ usedInset, lastInsetLine })))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.findInsetsForDocument', (uriOrPath: vscode.Uri | string) => {
    try {
      const targetPath = typeof uriOrPath === 'string' ? path.resolve(uriOrPath) : uriOrPath.fsPath
      const res: Array<{ blockId: string, line: number }> = []
      for (const [blockId, info] of webviewsByBlockId.entries()) {
        try { if (path.resolve(info.docPath) === targetPath) res.push({ blockId, line: info.line }) } catch {}
      }
      return res
    } catch { return [] }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.hasInsetAt', (uriOrPath: vscode.Uri | string, line: number) => {
    try {
      const targetPath = typeof uriOrPath === 'string' ? path.resolve(uriOrPath) : uriOrPath.fsPath
      for (const [, info] of webviewsByBlockId.entries()) {
        try { if (path.resolve(info.docPath) === targetPath && info.line === Math.max(0, Math.floor(Number(line)||0))) return true } catch {}
      }
      return false
    } catch { return false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.handleVivafolioBlockNotification', async (notification: any) => {
    try {
      logLine('info', `Received VivafolioBlock notification: ${notification.blockId}`)
      if (indexingService) {
        await indexingService.handleVivafolioBlockNotification(notification)
        logLine('info', `VivafolioBlock notification processed successfully`)
      } else {
        logLine('error', 'Indexing service not available to handle VivafolioBlock notification')
      }
    } catch (error) {
      logLine('error', `Failed to handle VivafolioBlock notification: ${error}`)
    }
  }))

  context.subscriptions.push(vscode.commands.registerCommand('vivafolio.executeRuntimeFile', async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor')
      return
    }

    const document = editor.document
    const filePath = document.uri.fsPath

    try {
      console.log('[Vivafolio] Starting runtime execution for:', filePath)

      // Execute the file and capture output
      const lines = await executeRuntimeFile(filePath)
      console.log('[Vivafolio] Execution successful, parsing VivafolioBlock notifications')

      // Parse VivafolioBlock notifications from output
      const notifications = parseRuntimeVivafolioBlock(lines)
      console.log('[Vivafolio] Found', notifications.length, 'VivafolioBlock notifications')

      if (notifications.length === 0) {
        vscode.window.showInformationMessage('No VivafolioBlock notifications found in output')
        return
      }

      // Convert to diagnostics
      const newDiagnostics = convertVivafolioBlockToDiagnostics(notifications, document)

      // Add new diagnostics to the collection
      diagnostics.set(document.uri, newDiagnostics)

      console.log('[Vivafolio] Runtime execution completed successfully')
      vscode.window.showInformationMessage(`Executed ${path.basename(filePath)} and loaded ${notifications.length} blocks`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[Vivafolio] Runtime execution failed:', errorMessage)
      vscode.window.showErrorMessage(`Execution failed: ${errorMessage}`)
    }
  }))
}

export async function deactivate() {
  try {
    logLine('info', 'Deactivating Vivafolio extension...')

    // Stop indexing service
    if (indexingService) {
      await indexingService.stop()
      indexingService = undefined
    }

    // Clean up block resources cache
    if (blockResourcesCache) {
      // BlockResourcesCache doesn't have a dispose method, but we can clear references
      blockResourcesCache = undefined
    }

    // Clean up block loader
    if (blockLoader) {
      blockLoader = undefined
    }

    // Clean up language client
    if (languageClient) {
      await languageClient.stop()
      languageClient = undefined
    }

    logLine('info', 'Vivafolio extension deactivated successfully')
  } catch (error) {
    logLine('error', `Error during deactivation: ${error}`)
  }
}
