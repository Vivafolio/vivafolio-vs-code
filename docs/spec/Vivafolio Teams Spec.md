A Platform for Version-Controlled, Collaborative Knowledge

[https://gemini.google.com/share/cc3976d0550f](https://gemini.google.com/share/cc3976d0550f)

## 1. Vision & Guiding Principles

The "Veritas" system is a knowledge and productivity platform built on the fundamental principle that **all organizational knowledge should be treated with the same rigor and discipline as source code.** It rejects the *black box* model of traditional low-code and SaaS tools, which obscure data and prevent robust development practices.

This system is designed for teams who understand that their operational data—project plans, tasks, wikis, and databases, is a critical asset that should be owned, versioned, and auditable.

The following principles guide every architectural and feature decision:

- **Total Data Custody:** The user and their organization have absolute ownership and control over their data. The system's foundation is a collection of local, plain-text files, ensuring data is never locked into a proprietary format or cloud service.
- **Data as Code:** All information, from wiki documents to database rows, is stored in human-readable plain text (e.g., Markdown, Org Mode, CSV, JSON). This makes the entire knowledge base portable, future-proof, and accessible to the full ecosystem of text-based development tools, including AI agents for automation and analysis.
- **Software Development Best Practices for Knowledge:** The system recognizes that a collaborative knowledge base is a living software project. It must therefore support the full development lifecycle:
  - **Local-First Development:** Changes can be made and tested locally without affecting the team.
  - **Staging & Review:** Changes are submitted through a formal code review process (e.g., a Git Pull Request), allowing for discussion, feedback, and approval before being integrated.
  - **Production Deployment:** The main branch of the repository represents the "production" source of truth for the entire organization.

## 2. Core Architecture

The system is composed of a local-first client application that operates on a directory of plain-text files, using Git as its foundational backend.

- **File-Based Storage:** The "database" is a folder of files on the user's local machine. Each conceptual "item" (a task, a project, an employee profile) is an individual text file.
- **Structured Metadata:** Data is stored within these files using non-proprietary, human-readable formats like YAML frontmatter or inline key-value pairs.
- **Git as the Transactional Backend****:** Git is not just for versioning. It serves as the system's transactional layer. A "change" is a commit. A "merge" is the integration of new knowledge. The Git remote (e.g., GitHub, GitLab) acts as the central, auditable source of truth.
- **Extensible via Plugins:** The client application must have a powerful plugin API to allow for the addition of new views, data sources, and custom workflows. Critically, the configuration and code for these plugins must be storable within the workspace itself, ensuring a consistent environment for the entire team.

## 3. Functional Requirements

### 3.1. The Knowledge Layer (Wiki)

- The system must provide a rich text editing experience that produces clean, standard Markdown or Org Mode files.
- It must support seamless `[[wiki-linking]]` between any two files in the workspace.
- It must support the embedding (transclusion) of content from one file into another, including specific sections or blocks.
- Support for standard rich content like images, tables, and collapsible sections is required.

### 3.2. The Data Layer (Database)

- **Flexible Data Storage:** The system supports multiple models for storing structured data, allowing users to choose the best format for their needs. All models are based on plain-text, version-controllable files.
  - **Atomic Notes:** For complex, document-like entities (e.g., Projects, Issues, Meeting Notes), each item is stored as an individual text file. This allows each "row" to have rich-text content alongside its structured metadata.
  - **Tabular Data Files:** For simpler, spreadsheet-like data, the system can directly read, query, and display data from structured text files like CSV, TSV, or JSON stored within the workspace.
- **Schema on Read:** The "schema" of a table is defined by the metadata fields within the files or the columns in a tabular file. The system does not enforce a rigid, top-down schema.
- **Schema Migration:** The system must support workflows for bulk-updating metadata across many files, analogous to a database schema migration. This is typically achieved via external scripting, leveraging the plain-text nature of the data.
- **Automated Sequential IDs:** The system must provide a mechanism for generating unique, sequential, and conflict-free IDs for items like issues or tasks. This will be implemented via an atomic, append-only log on a dedicated Git branch, managed by a background process to ensure a non-blocking user experience.
- **Potential Implementation Strategies**
- To accommodate different use cases (from solo users to large teams), the system could explore the following strategies for ID generation:

   1. **Client-Side Incrementing (Solo Use):** A simple client-side script that scans all existing issue files, finds the highest current ID, and increments it by one. This is fast and sufficient for individual users but is susceptible to race conditions in a multi-user environment.
   2. **Synchronous Git Log (Team Use - Basic):** A more robust method where a script interacts with a dedicated Git branch containing a single counter file. The process involves pulling the latest state, incrementing the counter, committing, and pushing. The push operation acts as an atomic "claim." If the push fails due to a concurrent claim by another user, the process retries. This guarantees consistency but introduces a user-facing delay during note creation.
   3. **Asynchronous Git Log with Reconciliation (Recommended for Teams):** The most advanced and user-friendly approach.

    - When a user creates a new issue, the system *immediately* assigns a temporary, random ID (e.g., `TEMP-random-string`) and allows the user to begin working.
    - A background process adds this new issue to a queue.
    - This background worker then executes the synchronous Git log strategy to claim a permanent, sequential ID (e.g., `ISSUE-123`).
    - Once the permanent ID is secured, the system finds the original note and updates its filename and metadata from the temporary ID to the permanent one. This provides an instantaneous user experience while ensuring eventual consistency and conflict-free IDs.

### 3.3. The Presentation Layer (Views & Projections)

The system must be able to render dynamic, query-based "projections" of the underlying data. These views use the functional-reactive programming paradigm to update in real-time as the underlying data changes.

- **Query Engine:** A powerful, declarative query language (e.g., SQL-like) must be available to filter, sort, and group data from notes and tabular files based on their metadata.
- **Table Views:** The primary view for displaying query results.
- **Specialized Views:** The system must support, via core functionality or plugins, other common projections, including:
  - **Kanban Boards:** Where columns represent a `status` field.
  - **Gantt Charts & Timelines:** Based on `startDate` and `endDate` fields.
  - **Calendars:** Based on a `date` field.

### 3.4. Interactivity & Automation

- **Interactive Tables:** Users must be able to interact with certain views to modify the underlying data. This includes:
  - Clicking on table headers to sort the data.
  - Using interactive UI elements (text boxes, dropdowns) to filter the data in a view.
  - Editing a metadata property (e.g., changing a status via a dropdown) directly from the view, which updates the source text file.
- **Templating Engine:** A powerful templating and scripting engine (e.g., JavaScript-based) is required to automate the creation of new notes. This engine must be able to:
  - Insert boilerplate content.
  - Execute custom scripts to fetch data or calculate values (e.g., fetching the current user's nickname from a central "Team" directory).
  - Programmatically set the filename and metadata of the new note.
- **Custom Rendering:** When an item is referenced in another context, different visualization templates can be defined (e.g. a teammate assigned to a task may appear as a profile picture in a table view, a task can be viewed as a card in a Kanban view and as a styled title when it’s referenced in a Wiki document, etc).

### 3.5. Collaboration & Workflow

The system will support a dual-mode collaboration model to balance speed and stability.

- **The Formal Workflow (Default):** All changes to the core knowledge base are managed through the Git repository. The standard process is:

   1. A user pulls the latest changes.
   2. They create a new branch to work on a set of changes.
   3. They commit their changes locally.
   4. They push the branch and open a Pull Request for review.
   5. After approval, the changes are merged into the main branch.

- **The Live Workflow (Optional):** For designated, ephemeral use cases like live meeting notes or brainstorming, the system will support a real-time, CRDT-based synchronization model.
  - Specific folders within the workspace can be marked for "live sync."
  - Files within these folders will be ignored by Git to prevent conflicts.
  - A server (which can be self-hosted) will relay changes between connected users in real-time.
  - An automated "bridge" node can be configured to periodically commit snapshots of the live-synced files to the Git repository for backup and auditing purposes.

### 3.6. Extensibility & Integration

- **Cross-Workspace Linking:** The system must support the inclusion of shared, common knowledge bases (e.g., a company-wide team directory) into project-specific workspaces. The recommended implementation for this is **Git Submodules**, which provides explicit versioning of the shared dependency.
- **Command-Line Access:** Because the data is a collection of text files, it is inherently accessible to standard command-line tools and custom scripts for advanced querying and automation.

This specification outlines a system that empowers teams to build and manage their knowledge with the same power, control, and best practices they apply to their most critical software projects.