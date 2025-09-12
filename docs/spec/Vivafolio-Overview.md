# **Vivafolio: A System for Live, Interactive Programming**

### **Specification v0.5**

## **1\. Overview**

Vivafolio reimagines the programming experience by transforming the traditional, static text-based environment into a live, reactive, and visual canvas. Today's tools often force a sharp separation between code and its output. Notebooks like Jupyter improved visual outputs, but still lack a seamless way to handle rich visual inputs.

Vivafolio bridges this gap. It creates a powerful, notebook-like environment where interactive visual editors coexist inline with source code. The system is fully real-time: edits to both the code and the visual components take effect immediately, eliminating the need for manual cell re-runs.

The core innovation is to evolve the compiler from a batch code transformer into a long-running, interactive server that communicates directly with the IDE. This allows "compile-time" to become a dynamic, interactive phase.

This foundation is powered by the **Block Protocol**, an open standard for embeddable, data-centric components. By adopting this protocol, Vivafolio moves beyond simple inline widgets to foster a rich, plug-and-play ecosystem. Developers can combine blocks from various sources, and power users can override or extend functionality, creating a deeply customized and interoperable toolchain where data is as version-controllable and transparent as the code itself.

This paradigm extends far beyond data science. It can power:

* **Visual Programming:** Entire visual programming languages, like Scratch, can become blocks. This allows a graphical, node-based logic editor to be inserted directly into a larger codebase to interact seamlessly with traditionally written code.  
* **Parametric Design:** Engineers and designers can manipulate sliders, define curves, or adjust 3D models in a block to explore design variations, with every change instantly reflected through the procedural code that produces the final design.  
* **Interactive Textbooks:** Physics formulas can be paired with live simulations that students can modify in real-time.  
* **Domain-Specific Tools:** An engineer could use a block to visually configure a circuit board, with the output being precise hardware definition code.  
* **Information and Project Management Systems:** Enable the creation of powerful, collaborative platforms that recreate and surpass the capabilities of tools like Notion, Coda, and Airtable. By treating all data—tasks, documents, database rows—as human-readable plain text stored in a Git repository, Vivafolio provides the foundation for building auditable, version-controlled knowledge bases that challenge the world of spreadsheets and proprietary SaaS tools.

Vivafolio aims to create a deeply integrated environment where code, data, and interactive UIs are no longer separate concerns, but different views of the same underlying information.

## **2\. Core Architecture**

Vivafolio's architecture is designed to be **language-agnostic**, allowing blocks to be reused across different programming ecosystems. The initial version will target languages with strong CTFE support (Nim, D, Zig, Crystal, Lean, Rust) as well as languages well-suited for the runtime path (Python, Julia, Mojo). It supports two primary integration paths.


### **2.1. Compile-Time Function Evaluation (CTFE) Path**

1. **Instantiation:** A developer calls a helper macro or function to instantiate a block.  
2. **LSP Communication:** The language's LSP server discovers this instantiation and sends a VivafolioBlock notification to the Vivafolio Host extension.  
3. **Rendering & Interaction:** The Host extension manages the block's lifecycle, rendering it in a WebView. As the user interacts, the block sends updateEntity messages to the Host, which updates the gui\_state block in the source code, automatically triggering the LSP to re-evaluate and close the reactive loop.

### **2.2. Runtime Path**

For languages like Python, Julia, and Mojo, Vivafolio offers two runtime-driven approaches to accommodate different use cases and language capabilities.

#### **2.2.1. Simple Re-run Mode**

This mode is straightforward and requires minimal integration with the target program.

1. **Execution:** The program runs and emits a structured, out-of-band stream (e.g., to stdout) containing one or more VivafolioBlock payloads.
2. **Rendering:** The Host parses this stream and renders the blocks.  
3. **Editing & Re-run:** The user edits data through a block, which updates the persisted gui\_state block in the source code. To see the effect of this change, the user manually re-runs the program, initiating a new cycle.

#### **2.2.2. Interactive Hot-Reload Mode**

This advanced mode establishes a persistent, two-way communication channel with the running program, enabling a reactive loop without requiring a full manual restart.

1. **Persistent Connection:** The Vivafolio extension launches the target program as a long-running process and establishes a two-way IPC channel (e.g., using stdin/stdout or a Unix domain socket).  
2. **LSP-like Protocol:** Communication over this channel uses a framing and message-encoding format similar to the Language Server Protocol (e.g., JSON-RPC with Content-Length headers) for robustness.  
3. **Live Updates:** When a user's interaction with a block causes a change to the source code (the gui\_state block), the extension sends a notification to the running program, detailing the modified files.  
4. **Incremental Re-computation:** The program is equipped with a language-specific hot-code-reloading runtime. This runtime includes an incremental computation engine that, upon receiving a change notification, determines the minimal set of invalidated results that must be re-executed. It then runs the necessary computations and sends back new blockEntitySubgraph payloads to the extension, updating the UI in near real-time.

### **2.3. Adopting the Block Protocol**

To foster a rich, interoperable ecosystem, Vivafolio will adopt the **Block Protocol** as the standard communication layer between the Vivafolio extension (the "host application") and the inline visual editors (the "blocks").

This strategic decision provides several key advantages:

* **Standardization:** It replaces a custom communication protocol with a well-defined, open standard for embeddable, data-centric components.  
* **Graph-Based Data Model:** Blocks are not limited to editing their own state. They can interact with a rich graph of data entities managed by the host. This means a block representing a task on a Kanban board can directly edit the properties of a "person" entity defined in a separate company roster file.  
* **Interoperability:** Any component developed for the Block Protocol ecosystem can potentially be used within Vivafolio, and vice-versa.

**For a complete technical breakdown of this integration, please refer to the detailed specification: BlockProtocol-in-Vivafolio.md.**

## **3\. Proof of Concept (POC) Specification**

### **3.1. POC Goals**

* **Language-Agnostic Trigger:** Utilize LSP diagnostics as a universal trigger mechanism.  
* **Block Protocol Compatibility:** Define a discovery payload and message protocol that aligns with the Block Protocol standard.  
* **Support for Inline and Multi-line Blocks:** Clearly define and implement both display modes.  
* **Hot Reloading:** Implement a basic hot code reloading mechanism for blocks.  
* **Deterministic Sources:** Support idiomatic, language-specific patterns for persisting block entity data.  
* **Robust Default:** Render a generic shell if a block's full implementation is not provided.

### **3.2. Communication Protocol**

#### **Trigger Mechanism**

The protocol is initiated when the Vivafolio Host receives a VivafolioBlock notification from an LSP or runtime process.

#### **LSP/Runtime Notification: VivafolioBlock Payload**

This is the primary payload sent from language tooling to the editor extension. It is a lightweight pointer, informing the Host *where* to render a block and which entity it corresponds to.

{  
  "blockType": "\[https://blockprotocol.org/@blockprotocol/types/block-type/kanban-board/v/1\](https://blockprotocol.org/@blockprotocol/types/block-type/kanban-board/v/1)",  
  "displayMode": "multi-line",  
  "sourceUri": "file:///path/to/project/file.nim",  
  "range": {
    "start": { "line": 10, "character": 4 },
    "end": { "line": 18, "character": 7 }
  },  
  "entityId": "optional-entity-id-from-source",
  "initialGraph": {  
    "entities": [
      { "entityId": "entity-uuid-123", "properties": { "value": 42 } }
    ],  
    "links": []  
  },
  "supportsHotReload": true,  
  "initialHeight": 250,  
  "resources": [  
    {
      "logicalName": "index.html",  
      "physicalPath": "file:///path/to/project/block/index.html",  
      "cachingTag": "eTag-or-hash-123"  
    }  
  ]
}

#### **WebView Message Protocol (Block Protocol)**

Communication between the Host extension and the block's WebView will adhere to the official Block Protocol's message specification.

**Host → Block:**

* blockEntitySubgraph (for initial hydration and all subsequent data updates)

**Block → Host:**

* updateEntity, createEntity, etc. (for all data mutations)  
* hook (for nesting blocks, requesting host services, and triggering workflows)

### **3.3. Block Lifecycle and Performance**

1. **Discovery:** The Host receives a VivafolioBlock notification.  
2. **ID Resolution:** The Host centralizes entityId management. If an ID is absent from the notification, the Host generates a deterministic one based on the file path and location.  
3. **Instant Hydration:** To eliminate rendering latency, the Host embeds the initial blockEntitySubgraph data directly into a \<script type="application/json"\> tag in the block's HTML. The block hydrates its state instantly on load, without a ready message round-trip.  
4. **Subsequent Updates:** If the underlying data changes (e.g., from a code change or a REPL command), the Host sends a new blockEntitySubgraph message to the running block to update its view.

### **3.4. State Persistence and Folding**

Block entity data is persisted into the source code via a gui\_state construct. This content is **opaque** to the Host; it can be a primitive value, JSON, YAML, or a custom DSL, as long as the language-specific tooling can parse it into a structured object for the Host.

* **Nim:** gui\_state(Task, """{"status":"Done"}""")  
* **Rust & Lean:** gui\_state\!(Task, r\#"{"status":"Done"}"\#)

### **3.5. Block Display Modes**

Vivafolio supports two distinct rendering modes for blocks, controlled by the displayMode property in the VivafolioBlock payload.

#### **3.5.1. Multi-line Blocks**

This is the default mode for complex UIs like dashboards, rich text editors, or graph visualizations.

* **Rendering:** The block is rendered in a dedicated WebView inset that occupies one or more full lines *between* lines of code.  
* **Interaction:** The user interacts directly with the fully-featured block UI. All interactions are live.

#### **3.5.2. Inline Blocks**

This mode is designed for compact UIs like color pickers, sliders, or simple data previews that should appear *within* a line of code without disrupting the layout.

* **Rendering:** The block is rendered as a lightweight, non-interactive decoration that replaces its source code representation (e.g., Color("\#FF0000") is replaced by a red color swatch).  
* **Interaction:**  
  * Some inline blocks may offer limited direct interaction if the host environment supports it (e.g., a simple slider).  
  * The primary interaction model is **click-to-edit**. When a user clicks the inline block's decoration, the host will present a larger, fully interactive editor for that block.  
  * This full editor can be presented either as a temporary multi-line block that expands below the current line, or in a separate popup/side panel, depending on the capabilities and UX conventions of the host environment.

## **4\. Future Work & Long-Term Vision: A Block-Based Ecosystem**

The adoption of the Block Protocol enables a powerful long-term vision for Vivafolio as a platform for a rich, interconnected ecosystem of tools.

### **4.1. Composite and Nested Blocks**

Blocks can be composed of other blocks. For example, a "Kanban Board" block could render task cards, and within each card, the assignee's avatar could be another, separate "Avatar" block. An "Org Chart" block could then reuse the exact same "Avatar" block. This creates a powerful system of plug-and-play components that can be combined in novel ways across different workspaces.

### **4.2. Host Services and the Intent System**

Vivafolio, as the host application, can provide services that blocks can request via hook messages. This creates a powerful, intent-like system. For example:

* A block might request a markdown editing surface by calling a markdown:edit service.  
* The Vivafolio host provides a default implementation.  
* However, the user can install a separate plugin (e.g., a "Vim-mode Markdown Editor" plugin) that registers a higher-priority provider for the markdown:edit service.  
* Now, when any block requests a markdown editor, the user's preferred Vim-style editor is instantiated, providing a deeply customizable and personalized experience.

### **4.3. A Multi-Language Block Ecosystem**

A core goal of Vivafolio is to foster a rich, **cross-language ecosystem of blocks**. Because blocks are built with standard web technologies, a single block can be used seamlessly across any supported programming language. For languages that compile to JavaScript or WebAssembly, Vivafolio will provide **easy-to-use DSLs and libraries** to define both blocks and their activating symbols within the language's native metaprogramming facilities.

### **4.4. Incremental Computing Engine**

To ensure the reactive loop remains fast, we will integrate an incremental computing engine inspired by systems like **Salsa**, which intelligently caches and reuses computation results.

### **4.5. Multi-User Collaboration**

The Block Protocol's graph-based architecture is a natural fit for CRDTs, paving the way for real-time multi-user collaboration in the future.

### **4.6. Programmatic Editing via a REPL**

To provide maximum flexibility and enable advanced automation workflows, Vivafolio will offer an integrated REPL (Read-Eval-Print Loop). This REPL will serve as a command-line interface to the underlying data graph.

* **Live Object Graph Interaction:** Users can execute commands to programmatically query and manipulate the entities and links in the project's data graph.  
* **Real-time Updates:** Any changes made via the REPL—such as creating a new task entity, updating a property on a user profile, or linking two documents—will be instantly reflected in any visible blocks that depend on that data.  
* **Persistent Backing Stores:** These programmatic edits will be immediately persisted to the underlying data storage layer. This ensures that a REPL command to update an entity's property is functionally equivalent to editing it through a block UI. The backing store is typically a collection of human-readable files (Markdown, JSON), but could also be a local database like SQLite for more complex, structured data sets.

## **5\. Security Model**

* **Sandboxing:** All block HTML runs inside a sandboxed WebView.  
* **Local File Access:** The editor extension will access local files, restricted to the project workspace.  
* **Script Injection:** The extension only injects a minimal, trusted script for core communication.

## **6\. Technical Implementation Blueprint (VS Code)**

This section provides a concrete technical blueprint for building the Vivafolio extension for Visual Studio Code.

**Note:** This implementation targets **Visual Studio Code Insiders** and relies on proposed APIs for the optimal user experience.

### **6.1. Sequence Diagrams**

#### **Initial Discovery and Rendering**

sequenceDiagram  
    participant LSP  
    participant HostExtension as Vivafolio Host  
    participant BlockWebView as Block WebView

    LSP-\>\>HostExtension: VivafolioBlock  
    HostExtension-\>\>HostExtension: Generate entityId if needed  
    HostExtension-\>\>HostExtension: Look up entity in Workspace Index  
    HostExtension-\>\>HostExtension: Generate HTML with embedded blockEntitySubgraph  
    HostExtension-\>\>BlockWebView: Create WebView with initial HTML  
    BlockWebView-\>\>BlockWebView: Script loads, parses embedded data  
    BlockWebView-\>\>BlockWebView: Renders UI instantly (No round-trip)

#### **User Interaction and Data Persistence**

sequenceDiagram  
    participant User  
    participant BlockWebView as Block WebView  
    participant HostExtension as Vivafolio Host  
    participant FileSystem as Workspace Files

    User-\>\>BlockWebView: Edits data (e.g., changes task status)  
    BlockWebView-\>\>HostExtension: postMessage (updateEntity)  
    HostExtension-\>\>HostExtension: Update in-memory graph  
    HostExtension-\>\>HostExtension: Look up sourceUri for entityId  
    HostExtension-\>\>FileSystem: Read file  
    HostExtension-\>\>FileSystem: Modify file content (e.g., YAML frontmatter)  
    HostExtension-\>\>FileSystem: Write file

#### **Inline Block "Click-to-Edit" Interaction Flow**

sequenceDiagram  
    participant User  
    participant VS Code Editor  
    participant Vivafolio Host Extension  
    participant Full Editor (New Inset/Panel)

    User-\>\>VS Code Editor: Clicks on Inline Block Decoration  
    VS Code Editor-\>\>Vivafolio Host Extension: Triggers 'vivafolio.editBlock' command  
    Vivafolio Host Extension-\>\>Vivafolio Host Extension: Get Block data for the clicked position  
    alt Expand Below  
        Vivafolio Host Extension-\>\>VS Code Editor: createWebviewTextEditorInset (Multi-line)  
    else Open in Panel  
        Vivafolio Host Extension-\>\>VS Code Editor: createWebviewPanel  
    end  
    Vivafolio Host Extension-\>\>Full Editor (New Inset/Panel): Serve resources & send blockEntitySubgraph  
    User-\>\>Full Editor (New Inset/Panel): Edits block data  
    Full Editor (New Inset/Panel)--\>\>Vivafolio Host Extension: postMessage (updateEntity)  
    Vivafolio Host Extension-\>\>VS Code Editor: workspace.applyEdit (updates gui\_state block)

### **6.2. Core VS Code API Mapping**

This section details the specific VS Code APIs required for the core features, including the two block display modes.

#### **Triggering and Diagnostic Handling**

* **API:** vscode.languages.onDidChangeDiagnostics  
* **Source:** [Official onDidChangeDiagnostics Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23languages.onDidChangeDiagnostics)

#### **Rendering Multi-line Blocks (Proposed API)**

* **API:** vscode.window.createWebviewTextEditorInset  
* **Purpose:** This proposed API is used for **multi-line blocks**, embedding a live WebView directly *between* lines of code. Its usage requires a **VS Code Insiders build** and may be subject to change.  
* **Source:** Progress can be tracked in the VS Code GitHub repository, e.g., in issue [microsoft/vscode\#104619](https://www.google.com/search?q=https://github.com/microsoft/vscode/issues/104619).

#### **Rendering Inline Blocks**

* **API:** vscode.window.createTextEditorDecorationType  
* **Purpose:** Used for **inline blocks**. This API allows a range of text to be replaced with custom styled HTML content (e.g., a color swatch). This provides a non-interactive or lightly interactive preview of the block's state directly within the text flow of a code line.  
* **Source:** [Official createTextEditorDecorationType Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23window.createTextEditorDecorationType)

#### **Interaction with Inline Blocks ("Click-to-Edit")**

* **API:** vscode.commands.registerCommand in conjunction with vscode.languages.registerCodeLensProvider.  
* **Purpose:** Since decorations are not directly clickable, interaction is best handled by registering a command (vivafolio.editBlock) and then using a CodeLensProvider to place a subtle, clickable "edit" action above or near the decorated inline block. This provides a reliable trigger for the "click-to-edit" workflow.  
* **Sources:**  
  * [Official registerCommand Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23commands.registerCommand)  
  * [Official registerCodeLensProvider Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23languages.registerCodeLensProvider)

#### **Displaying Full Block Editors (Popups / Panels)**

* **API:** vscode.window.createWebviewPanel or dynamically creating a temporary multi-line WebviewTextEditorInset.  
* **Purpose:** When the "click-to-edit" command is triggered for an inline block, one of these APIs is used to present the full, interactive block editor to the user.  
* **Source:** [Official createWebviewPanel Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23window.createWebviewPanel)

#### **WebView Communication**

* **API:** webview.onDidReceiveMessage and webview.postMessage  
* **Purpose:** These are the standard methods for two-way communication between the VS Code extension host and the sandboxed WebView. onDidReceiveMessage is used to listen for events from the block, while postMessage is used to send data and commands to the block, adhering to the Block Protocol specification.  
* **Source:** [Official WebView Communication Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/extension-guides/webview%23scripts-and-message-passing)

#### **State Persistence in Source Code**

* **API:** vscode.workspace.applyEdit  
* **Purpose:** When the extension receives an updateEntity message from a block that requires persistence, it needs to write the new state back to the source file. This is done by creating a WorkspaceEdit, specifying the range of the gui\_state block to replace and the new serialized entity data, and then applying it with applyEdit.  
* **Source:** [Official applyEdit Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23workspace.applyEdit)

#### **Hiding State Blocks via Programmatic Folding**

* **API:** vscode.languages.registerFoldingRangeProvider  
* **Purpose:** The ideal way to hide gui\_state blocks is to collapse them. The extension will implement a FoldingRangeProvider that scans the document for the language-specific state patterns and returns their ranges. This approach completely collapses the lines from view, saving vertical space.  
* **Source:** [Official registerFoldingRangeProvider Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/references/vscode-api%23languages.registerFoldingRangeProvider)  
* **Alternative Considered (Text Decorations):** Using vscode.window.createTextEditorDecorationType to make text invisible is suboptimal because the lines still occupy blank space in the editor. Programmatic folding provides a much cleaner result.

#### **Serving Block Resources**

* **API:** webview.asWebviewUri  
* **Purpose:** To load local resources (JS, CSS, WASM files) from the user's workspace into the sandboxed WebView, their file paths must be converted into a special URI that the WebView can access. This API handles that conversion, respecting the localResourceRoots security setting.  
* **Source:** [Official asWebviewUri Documentation](https://www.google.com/search?q=https://code.visualstudio.com/api/extension-guides/webview%23loading-local-content)