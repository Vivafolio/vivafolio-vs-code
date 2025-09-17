# **Vivafolio Technical Specification: Block Protocol Integration v0.5**

## **1\. Introduction & Core Requirements**

### **1.1. Overview**

This document specifies the technical architecture for integrating the **Block Protocol** within the Vivafolio ecosystem. The goal is to define a robust, scalable, and standardized foundation for data modeling, component communication, and user interaction. This specification refines the initial draft (v0.4) by centralizing data graph management within the Vivafolio Host and detailing the mechanisms for representing diverse data sources—from inline code values to file-based datasets—as a cohesive, interactive graph of Block Protocol entities.

### **1.2. Core Requirements**

The architecture must satisfy the following core requirements:

* **R1: Inline Code as Entities:** Provide a mechanism to represent simple and complex values defined in source code (e.g., within a gui\_state block) as first-class Block Protocol entities, manipulable by visual editors.  
* **R2: File-Based Data as Entities:** Model structured data from external files (e.g., CSVs, collections of Markdown files) as a graph of linked entities, supporting relational concepts like foreign keys.  
* **R3: Generic & Specialized Editors:** Allow blocks to specify their data requirements using structural typing ("duck typing") so that generic editors (e.g., a table) and specialized editors (e.g., a Kanban board) can operate on any compatible entity type.  
* **R4: Composite & Nested Blocks:** Enable blocks to be composed of other blocks, allowing for a rich, reusable component ecosystem (e.g., an "Avatar" block nested within a "Task Card" block).  
* **R5: User-Defined Block Overrides:** Implement a host-service mechanism that allows users to override the default rendering of a block with a preferred alternative implementation.  
* **R6: Interactive Workflows:** Support blocks that can trigger custom workflows, such as displaying forms to capture user input for actions (e.g., a "Create Task" button).

## **2\. Glossary**

* **Vivafolio Host (or Host):** The main Vivafolio extension running within the editor (e.g., VS Code). It acts as the "embedding application" in the Block Protocol, responsible for managing the data graph, discovering blocks, and orchestrating communication.  
* **Block:** A self-contained, interactive component built with web technologies (HTML, JS, CSS) that runs in a sandboxed WebView. It communicates with the Host using the Block Protocol message specification.  
* **Entity:** A structured data object, analogous to a row in a database or an object in programming. It is the fundamental unit of data in the Block Protocol. Every entity has a unique entityId and a corresponding entityTypeId.  
* **EntityType:** A schema that defines the structure and properties of a type of entity. It acts as a contract for what data a block can expect.  
* **Link:** A special type of entity that creates a directional relationship between two other entities, forming the basis of the data graph.  
* **Workspace Indexer:** A core service within the Vivafolio Host responsible for scanning the user's project workspace, parsing supported files (source code, Markdown, CSVs), and building the complete data graph of all entities and links.  
* **Block Discovery Notification:** A lightweight message sent from a Language Server or runtime process to the Vivafolio Host. Its sole purpose is to inform the Host that a block's UI should be rendered at a specific location in a source file, pointing to a root entity.

## **3\. Core Architecture**

### **3.1. System Components**

The Vivafolio system is composed of four primary components, each with a distinct responsibility. This architecture centralizes data management in the Host to ensure consistency and simplify the logic of other components.

* 1\. Vivafolio Host Extension (The Orchestrator):  
  The Host is the central nervous system of the entire Vivafolio experience. It is the sole owner and manager of the workspace's data graph. Its responsibilities include:  
  * Running the **Workspace Indexer** to build and maintain the in-memory graph of all entities.  
  * **Generating deterministic entityIds** for discovered blocks if one is not provided.  
  * Listening for **Block Discovery Notifications** from LSPs and runtime processes.  
  * Managing the lifecycle of **Block WebViews** (creation, destruction, data passing).  
  * Serving as the local web server for block resources (asWebviewUri).  
  * Handling all Block Protocol messages from blocks (e.g., **updateEntity**), processing data updates, and persisting changes back to the file system.  
  * Interacting with the version control system (Git) to commit changes.  
* 2\. Workspace Indexer (The Data Source):  
  A sub-service of the Host, the Indexer is responsible for creating the "source of truth" for all UI components. It continuously monitors the workspace and:  
  * Scans for gui\_state constructs in source code files.  
  * Parses relational data from Markdown files (with frontmatter) and CSVs.  
  * Constructs a complete, in-memory graph of all entities and their links using @blockprotocol/graph.  
  * Maintains a mapping between each entityId and its source file (sourceUri).  
  * Watches for file system changes to update the graph in real-time.  
* 3\. Language Server (LSP) / Runtime Process (The Discoverer):  
  The role of the LSP is simplified. Its sole responsibility is to identify locations where a block should be rendered. It emits a lightweight Block Discovery Notification to the Host. The entityId in this notification is optional. The LSP may provide it if it is explicitly defined in the source (e.g., in a gui\_state block), but the Host is the final authority on ID generation.  
* 4\. Block / WebView (The UI):  
  The Block is a pure UI component. It is completely decoupled from the data's origin and persistence logic. It runs in a sandboxed WebView and:  
  * Receives its initial data directly embedded in its HTML by the Host, representing the **blockEntitySubgraph**.  
  * Renders a UI based on that data.  
  * When the user makes a change, it sends a standard Block Protocol message, such as **updateEntity**, back to the Host.  
  * It has no direct access to the file system or any other part of the editor.

### **3.2. Block Lifecycle: From Discovery to Interaction**

This centralized architecture creates a predictable and robust lifecycle for every block.

1. **Indexing:** On startup, the Vivafolio Host activates the Workspace Indexer, which scans the project and builds the complete entity graph in memory.  
2. **Discovery:** The user opens a file. The LSP analyzes the code, finds a gui\_state construct, and sends a Block Discovery Notification to the Host. This notification contains the source code range for rendering and, optionally, an entityId if one is present in the code.  
3. **Rendering & ID Resolution:** The Host receives the notification.  
   * If an entityId was provided, it uses it.  
   * If no entityId was provided, the Host generates a new, deterministic one based on the file path and location.  
   * It uses this final entityId to look up the full entity data from its in-memory graph. It then creates a WebView inset at the specified code range.  
4. **Instant Hydration:** To eliminate rendering latency, the Host does **not** wait for a ready message. Instead, it serializes the initial **blockEntitySubgraph** data to JSON and embeds it directly into a \<script type="application/json"\> tag within the WebView's HTML. When the block's JavaScript loads, it immediately reads from this script tag and hydrates its state, resulting in an instantaneous render.  
5. Interaction & Persistence (The "Reactive Loop"):  
   a. The user interacts with the block.  
   b. The block's code translates this into a data change and sends an updateEntity message to the Host (e.g., { data: { entityId: 'task-42', properties: { status: 'Done' } } }).  
   c. The Host receives the message. It updates its in-memory graph and uses its internal index to find the source file for task-42.  
   d. The Host reads the source file, updates the data (e.g., in the frontmatter or gui\_state block), and writes the changes back to disk.  
   e. This file change is picked up by the Workspace Indexer and may trigger other UI updates if necessary.

This architecture ensures a clear separation of concerns, making the system more modular, performant, and easier to extend.

## **4\. Technical Implementation Details**

This section details the specific mechanisms, schemas, and message flows used to satisfy the core requirements of the Vivafolio system.

### **4.1. R1: Representing In-Code Data as Entities**

To represent values from source code as manipulable entities, Vivafolio will map type definitions from the programming language into dynamic EntityType schemas. This creates a rich, type-aware system.

#### **4.1.1. Data and Schema Extraction**

The language's macro or runtime process is responsible for parsing the gui\_state content and providing two key pieces of information to the Host: the **data payload** and a **JSON Schema** that describes its structure.

The gui\_state string is opaque to the Host; it can be a primitive value, JSON, YAML, or a custom DSL. The language-specific tooling must resolve it into a structured JSON object or primitive. For primitives, the Host will wrap them in a { "value": ... } structure to form a valid entity properties object.

* **Source Code (Nim Example with Type Definition):**  
  type Task \= object  
    title: string  
    completed: bool  
    priority: string

  gui\_state(Task, """  
  {  
    "title": "My First Task",  
    "completed": false,  
    "priority": "High"  
  }  
  """)

#### **4.1.2. Dynamic EntityType Registration**

The Vivafolio Host receives the schema and dynamically registers it as a new EntityType. The entityTypeId is derived deterministically from the type's source location (e.g., file://src/my\_module.nim\#Task) to ensure stability.

#### **4.1.3. Schema Reconciliation and Validation**

A potential conflict arises when the Host enriches an entity with properties like sourceUri that are not present in the original, user-defined schema. A strict validation against the original schema would fail.

To resolve this, the Vivafolio Host performs **Schema Expansion**. Before registering a user-provided schema as a valid EntityType, the Host programmatically expands it by merging in definitions for Host-managed properties. This results in a final, more comprehensive schema that is used for validation.

* **Schema from LSP (User-Defined):**  
  {  
    "type": "object",  
    "properties": {   
      "title": { "type": "string" },  
      "completed": { "type": "boolean" }  
    },  
    "additionalProperties": false  
  }

* **Expanded Schema in Host (Final EntityType):**  
  {  
    "type": "object",  
    "properties": {   
      "title": { "type": "string" },  
      "completed": { "type": "boolean" },  
      "sourceUri": { "type": "string", "format": "uri" },  
      "readonly": { "type": "boolean", "default": false }  
    },  
    "additionalProperties": false  
  }

An enriched entity is then validated against this final, expanded schema. This pattern provides stricter validation and a more explicit data contract than using additionalProperties: true, while keeping user-defined schemas clean.

#### **4.1.4. Entity Generation and Enrichment**

The Block Protocol specification requires that custom metadata reside within the properties object. To handle cross-cutting concerns, the Vivafolio Host will perform **Host Enrichment**.

The Workspace Indexer constructs the entity by combining the user's data with Host-managed metadata. It programmatically **injects** properties like sourceUri and readonly into the properties object of the final in-memory entity.

* **Generated Entity (In-Memory):**  
  {  
    "entityId": "file://src/my\_module.nim\#L6-13",  
    "entityTypeId": "file://src/my\_module.nim\#Task",  
    "properties": {  
      "sourceUri": "file://src/my\_module.nim\#L6-13",  
      "readonly": false,  
      "title": "My First Task",  
      "completed": false,  
      "priority": "High"  
    }  
  }

This model ensures that user-defined schemas remain focused on domain data, while the Host transparently manages and injects the necessary system-level metadata.

### **4.2. R2: File-Based Data as Entities**

Vivafolio will treat collections of structured text files as a relational database, with entities representing rows and links representing foreign key relationships.

#### **Data Sources**

The Workspace Indexer will support parsing:

1. **Markdown Files:** The YAML frontmatter will be parsed as the properties of an entity. The entityId will be derived from the file path.  
2. **CSV Files:** Each row will be parsed into a separate entity. The entityId can be derived from a designated ID column or the row number.

#### **Modeling Relationships with Links**

The Block Protocol's Link entity is the key to representing foreign key relationships.

* **Example:** A tasks folder contains Markdown files, and a people.csv file defines users. A task can be assigned to a person.  
* **tasks/buy-milk.md:**  
  \---  
  title: Buy Milk  
  status: To Do  
  assignee: person-jane-doe  
  \---  
  Remember to get oat milk.

* **people.csv:**  
  id,name,email  
  person-john-smith,"John Smith",john@example.com  
  person-jane-doe,"Jane Doe",jane@example.com

When the Workspace Indexer processes these files, it will generate three entities (task-buy-milk, person-john-smith, person-jane-doe) and one **Link entity**.

* Generated Link Entity (In-Memory):  
  This special entity connects the task to the person.  
  {  
    "entityId": "link-task-assignee-1",  
    "entityTypeId": "\[https://vivafolio.org/link-types/assignee/v1\](https://vivafolio.org/link-types/assignee/v1)",  
    "sourceEntityId": "task-buy-milk",  
    "destinationEntityId": "person-jane-doe",  
    "properties": {}  
  }

When a block requests the task-buy-milk entity, the Vivafolio Host will traverse the graph and include both the task and the linked person-jane-doe entity in the blockEntitySubgraph it sends to the block. This gives the block all the data it needs to display the task and the assignee's details.

### **4.3. R3: Generic & Specialized Editors (Structural Typing)**

Vivafolio will enable a "Lego-like" experience where different blocks can operate on the same data, so long as the data's structure meets the block's minimum requirements. This is achieved through structural typing, often called "duck typing."

#### **Block Schema Definition**

Each block must declare the shape of the data it expects in its block-metadata.json file. This is a JSON Schema that defines the required properties and their types.

* Example: Generic Table Block block-metadata.json:  
  This block is generic. It only requires an array of any kind of object.  
  {  
    "schema": {  
      "type": "array",  
      "items": { "type": "object" }  
    }  
  }

* Example: Kanban Board Block block-metadata.json:  
  This block is specialized. It requires an array of objects that must have title and status properties.  
  {  
    "schema": {  
      "type": "array",  
      "items": {  
        "type": "object",  
        "properties": {  
          "title": { "type": "string" },  
          "status": { "type": "string" }  
        },  
        "required": \["title", "status"\]  
      }  
    }  
  }

#### **Host's Block Matching Logic**

When a user wants to view or edit an entity, the Vivafolio Host performs a **Block Matching** process:

1. It retrieves the EntityType schema for the target entity (or a collection of entities).  
2. It scans its registry of all known blocks.  
3. For each block, it checks if the entity's schema is **structurally compatible** with the block's declared schema.  
4. It presents all compatible blocks to the user as rendering options.

This means a collection of Task entities (which have title and status) could be edited with either the generic Table Block or the specialized Kanban Board Block, giving users immense flexibility.

### **4.4. R4: Composite & Nested Blocks**

Nested rendering will be handled client-side within the WebView's "mini-host" environment to ensure high performance and rich interactivity between parent and child blocks.

#### **Mechanism: The hook Message**

A parent block (e.g., TaskCard) that needs to render a child block (e.g., Avatar) for a linked entity will use the **Block Protocol's Hook Module**.

1. **Placeholder:** The parent block renders an empty, identifiable DOM element (e.g., \<div id="assignee-slot"\>\</div\>) where the child should appear.  
2. **hook Message:** The block sends a hook message to the Host. The libraries (@blockprotocol/react) abstract this into a simple function call like addEmbedRef(entityId, domElement).  
   * **Message Name:** hook  
   * **Source:** block  
   * **Payload:**  
     {  
       "node": "\[DOM element reference\]",  
       "type": "vivafolio:embed:entity",  
       "entityId": "person-jane-doe",  
       "hookId": null  
     }

#### **Client-Side Rendering by the Mini-Host**

The hook message is intercepted by the mini-host script within the WebView, not the main extension backend.

1. **Interception:** The mini-host intercepts the hook message.  
2. **Block Resolution:** It uses the entityId to look up the entity's entityTypeId from the initial graph data. It then consults its block registry to find the appropriate component for that type (e.g., AvatarBlock).  
3. **Dynamic Loading (if needed):** If the AvatarBlock's code is not yet loaded, the mini-host sends a fetch-block-code message to the extension backend to retrieve it.  
4. **Live Mounting:** Once the component is available, the mini-host uses its rendering library (e.g., React) to mount the live AvatarBlock component directly into the placeholder DOM element.

This client-side composition model is extremely fast and allows parent and child blocks to exist as live components in the same JavaScript context, enabling complex interactions.

### **4.5. R5: User-Defined Block Overrides (Host Services)**

Vivafolio will provide a powerful customization system, allowing users to replace default UI components with their preferred alternatives. This is also powered by the **Hook Module**.

#### **The "Intent" System**

Instead of a block rendering a specific component, it can declare its *intent* and ask the Host to provide a component that fulfills it.

1. **Block Request:** A block needing a rich-text editor sends a hook message with a semantic type.  
   * **Message Name:** hook  
   * **Type:** vivafolio:service:edit-markdown  
   * **Payload:** Contains the entityId and path to the markdown string to be edited.  
2. **Host Service Registry:** The Vivafolio Host maintains a prioritized registry of installed blocks that have declared they can provide the vivafolio:service:edit-markdown service.  
   * Default Markdown Editor (priority 0\)  
   * User-Installed Vim Editor Block (priority 100\)  
3. **Host Resolution:** The Host receives the hook message, checks its registry, and finds that the Vim Editor has the highest priority. It then instructs the Vim block to render in the slot provided by the requesting block.

This turns the Host into a service broker, enabling a deeply customizable and pluggable user experience.

### **4.6. R6: Interactive Workflows**

Blocks can contain UI elements (like buttons) that trigger complex, multi-step workflows managed by the Host.

#### **4.6.1. Block Action Trigger**

A KanbanBoard block has an "Add Task" button. When clicked, it sends a hook message requesting a workflow.

* **Message Name:** hook  
* **Type:** vivafolio:workflow:create-entity  
* **Payload:**  
  {  
    "entityTypeId": "\[https://vivafolio.org/entity-types/task/v1\](https://vivafolio.org/entity-types/task/v1)",  
    "initialProperties": { "status": "To Do" }  
  }

#### **4.6.2. Host Workflow Management & UI Presentation**

The Host receives this message and orchestrates the workflow. To gather the required user input, the Host will choose from several UI presentation strategies based on the complexity of the workflow.

* **Pattern 1: Integrated Form (WebviewPanel)**  
  * **Description:** The Host dynamically generates a form based on the requested EntityType's schema and renders it in a new vscode.window.createWebviewPanel. This opens a dedicated editor tab for data entry.  
  * **Use Case:** This is the **preferred method for multi-field data entry** (e.g., creating a new task with a title, description, and priority). It provides the best user experience for complex forms.  
  * **Flow:** The user fills out the form, clicks "Submit," and the webview sends the complete data object back to the Host in a single message.  
* **Pattern 2: External Browser Window (Local Server)**  
  * **Description:** For exceptionally complex or long-running UIs that might benefit from being "popped out" of the editor, the Host can start a local web server and use vscode.env.openExternal to launch a new browser window. Communication occurs via WebSockets or HTTP requests between the browser and the Host's local server.  
  * **Use Case:** Advanced scenarios like a detailed configuration wizard, a data visualization dashboard that a user wants on a second monitor, or an OAuth authentication flow.  
  * **Note:** The Host cannot control the size, position, or decorations of the external window.  
* **Pattern 3: Simple Prompts (InputBox / QuickPick)**  
  * **Description:** For the simplest workflows that require only a single piece of information, the Host can fall back to using vscode.window.showInputBox or vscode.window.showQuickPick.  
  * **Use Case:** A workflow to "Rename an entity" (one text field) or "Change status" (a predefined list of options). This should be avoided for multi-step or multi-field inputs.

Once the data is collected via one of these methods, the Host proceeds to create the entity, persist it to a new file, update its index, and notify the original KanbanBoard block to refresh its view.

## **5\. Communication Protocol in Detail**

This section defines the schemas for messages exchanged between system components and illustrates the interaction flows.

### **5.1. Discovery Protocol (LSP/Runtime → Host)**

The communication from language tooling to the Host is a unidirectional notification.

#### **vivafolio/blockDiscovery Notification**

This is the primary payload sent from an LSP server or runtime process to the Vivafolio Host.

* **Schema:**  
  {  
    "type": "object",  
    "properties": {  
      "blockType": {   
        "type": "string",  
        "description": "The URL of the block's metadata file or a well-known type identifier."  
      },  
      "displayMode": {  
        "enum": \["multi-line", "inline"\],  
        "default": "multi-line"  
      },  
      "sourceUri": {  
        "type": "string",  
        "format": "uri",  
        "description": "The URI of the source file containing the block."  
      },  
      "range": {  
        "type": "object",  
        "description": "The line/column range in the source file where the block's UI should be rendered."  
      },  
      "entityId": {  
        "type": "string",  
        "description": "Optional. The ID of the root entity. If absent, the Host will generate a deterministic ID."  
      }  
    },  
    "required": \["blockType", "sourceUri", "range"\]  
  }

### **5.2. Block Message Protocol (Host ↔ WebView)**

Communication between the Host and the WebView adheres to the official Block Protocol specification. The following are the key messages Vivafolio will utilize.

#### **Host → Block Messages**

* **blockEntitySubgraph:**  
  * **Purpose:** The primary mechanism for providing and updating a block's data.  
  * **When Sent:** On initial load (via embedded script tag) and whenever the underlying data changes in the Host's graph.  
  * **Payload:** A subgraph containing the block's root entity and any linked entities required for rendering.

#### **Block → Host Messages**

* **updateEntity / createEntity / deleteEntity:**  
  * **Purpose:** To mutate the data graph. These are the standard messages for all data modifications.  
  * **When Sent:** After a user interaction modifies data within the block.  
  * **Payload:** The entityId and the new properties for the entity.  
* **hook:**  
  * **Purpose:** To request nested block rendering (R4), user-defined overrides (R5), or interactive workflows (R6).  
  * **When Sent:** When a block needs to delegate a UI or an action to the Host.  
  * **Payload:** Contains the type of request (e.g., vivafolio:embed:entity, vivafolio:workflow:create-entity), the relevant entityId, and a DOM node reference (for R4/R5).

### **5.3. Sequence Diagrams (Mermaid Format)**

#### **Initial Discovery and Rendering**

sequenceDiagram  
    participant LSP  
    participant HostExtension as Vivafolio Host  
    participant BlockWebView as Block WebView

    LSP-\>\>HostExtension: vivafolio/blockDiscovery  
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

#### **Nested Block Rendering (Client-Side)**

sequenceDiagram  
    participant ParentBlock as Parent Block (in WebView)  
    participant MiniHost as Mini-Host (in WebView)  
    participant HostExtension as Vivafolio Host

    ParentBlock-\>\>ParentBlock: Renders placeholder div for child  
    ParentBlock-\>\>MiniHost: Sends 'hook' message (e.g., for 'assignee' entity)  
    MiniHost-\>\>MiniHost: Intercepts message  
    MiniHost-\>\>MiniHost: Resolve block component for assignee's entity type  
    alt Component not loaded  
        MiniHost-\>\>HostExtension: postMessage (fetch-block-code)  
        HostExtension--\>\>MiniHost: postMessage (block-code-response)  
    end  
    MiniHost-\>\>ParentBlock: Renders Child Block into placeholder div (Live Mount)

### **5.4. Published Bundle Execution Requirements**

To align with the security posture demonstrated in the Block Protocol reference implementation, the Vivafolio Host **must** enforce the following guardrails when executing third-party bundles (e.g., npm-published blocks):

1. **Dependency Allowlist:** Only modules explicitly approved by the Host (e.g., `react`, `react-dom`, Block Protocol runtimes) can be required. Any other CommonJS dependency **must** be blocked with a descriptive error.  
2. **Integrity Metadata:** The Host **must** compute a SHA-256 hash (or stronger) for each fetched bundle and surface that digest to diagnostics. Hosts deploying remote content **should** reject responses whose hash differs from recorded metadata.  
3. **Audit Logging:** For every bundle evaluation, capture the evaluated URL, timestamp, allowed dependencies, and any blocked dependency attempts. This metadata enables downstream policy enforcement (e.g., unit tests, telemetry).  
4. **Caching Discipline:** Cache-busting tags supplied in VivafolioBlock resources **must** be preserved when fetching bundle assets so blocks pick up updates without stale assets leaking into other instances.

> **Rationale:** These requirements mirror the behaviour validated in the POC (`apps/blockprotocol-poc/src/client/main.ts`), ensuring the Host mediates bundle execution instead of allowing arbitrary module resolution.

### **5.5. Multi-Instance Graph Synchronization**

When multiple blocks reference the same root entity, the Host **must** fan-out `blockEntitySubgraph` updates to every active WebView:

* Each incoming `updateEntity` **must** mutate the shared in-memory graph and immediately trigger fresh notifications for every connected instance (including the originator).  
* Hosts **must not** suppress updates based on the origin blockId—each WebView is responsible for de-duping optimistic UI state if needed.  
* Diagnostics **should** include the list of blockIds that received any given update, enabling regression tests like those captured in the Milestone 4 scenario.

> **Rationale:** The POC proved that twin instances of `test-npm-block` rely on a consistent broadcast model (`apps/blockprotocol-poc/src/server.ts`). Clarifying this behaviour avoids divergence with official Block Protocol expectations around shared graphs.

### **5.6. Baseline Graph Service Coverage**

Vivafolio treats the following Block Protocol graph services as **mandatory** for published blocks:

1. `aggregateEntities` supporting pagination metadata (`pageNumber`, `itemsPerPage`, `pageCount`, `totalCount`).  
2. Linked aggregation lifecycle (`createLinkedAggregation`, `updateLinkedAggregation`, `deleteLinkedAggregation`, `getLinkedAggregation`) with deterministic aggregationIds.  
3. `getEntity` returning the latest entity snapshot, even if the requested entity is not part of the initial subgraph.

Hosts **must** implement these services on the embedder side and tests **should** exercise them when onboarding a new block. This guarantee reflects the behaviour of Block Protocol starter blocks and prevents runtime failures when blocks call into the graph service helpers.

### **5.7. Development Diagnostics (Optional, Recommended)**

While not mandatory for production deployments, the Host **should** expose non-invasive diagnostics in development builds:

* A global registry (e.g., `window.__vivafolioDiagnostics`) containing loader metadata (hashes, dependency decisions) and live graph snapshots.  
* Toggleable logging for Block Protocol message traffic to aid regression tests.

Any diagnostic surface **must** respect the sandbox boundary and avoid leaking sensitive data to untrusted blocks; the Host is responsible for gating the feature behind trusted contexts (e.g., dev mode flag).

## **6\. Appendix: Key Block Protocol Libraries**

The Vivafolio implementation will rely on the official libraries provided by the Block Protocol team to ensure compliance and reduce development overhead.

* **@blockprotocol/graph:**  
  * **Used In:** Vivafolio Host (Workspace Indexer).  
  * **Purpose:** To define, create, validate, and manipulate the in-memory data graph. This library is the foundation for creating and managing entities, links, and schemas.  
* **@blockprotocol/hook:**  
  * **Used In:** Blocks (running in the WebView).  
  * **Purpose:** Provides the low-level functions for sending hook messages. This is the core dependency for composite blocks, service overrides, and workflows.  
* **@blockaproject/react** (or framework-specific equivalent):  
  * **Used In:** Blocks (running in the WebView).  
  * **Purpose:** A convenience wrapper around @blockprotocol/hook and other libraries that provides easy-to-use React hooks (e.g., useGraphModule, useBlockUpdater). This will be the primary library used by block developers.
