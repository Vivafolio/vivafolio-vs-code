# `.viv` Notebook Format - Future Roadmap

> [!NOTE]
> **Status**: Planned Feature (Not Currently Implemented)
>
> This document describes a future vision for the `.viv` file format. The `.viv` extension is **reserved** for this purpose and is not currently used in the Vivafolio project.

## Overview

The `.viv` format is planned as a **notebook format** that extends Markdown with embedded Vivafolio blocks. It aims to enable building a **Coda-like product** where users can create rich, interactive documents that combine text, data, and interactive components.

## Background

While the current Vivafolio implementation embeds interactive blocks within regular programming language source files (`.nim`, `.py`, `.rs`, etc.), the `.viv` format will provide a **document-centric** approach for knowledge management and collaboration.

## Planned Features

### Markdown Extension

The `.viv` format will be a superset of Markdown, allowing:
- All standard Markdown syntax (headings, lists, links, code blocks, etc.)
- YAML frontmatter for metadata
- Embedded Vivafolio blocks for interactive components

### Interactive Vivafolio Blocks

Documents will be able to embed interactive blocks inline:
- **Data tables** with real-time editing
- **Kanban boards** for task management
- **Charts and visualizations**
- **Form inputs and widgets**
- **Database views** (table, board, calendar, gallery, timeline)
- Custom blocks from the Block Protocol ecosystem

### Version Control Friendly

All content, including data managed by blocks, will be:
- **Plain text** and human-readable
- **Git-friendly** for version control and collaboration
- **Diffable** to track changes over time
- Stored with consistent formatting for minimal merge conflicts

### Bidirectional Synchronization

Like current Vivafolio blocks:
- UI changes will update the source document
- Document changes will update the UI in real-time
- No manual refresh or re-execution required

## Use Cases

### Information Management
- **Knowledge bases** with searchable, linked documents
- **Project wikis** with embedded task tracking and data tables
- **Documentation sites** with interactive examples and demos

### Collaboration and Planning
- **Team workspaces** similar to Notion/Coda
- **Meeting notes** with embedded action items and agendas
- **Project dashboards** with live metrics and visualizations

### Data-Centric Documents
- **Reports** with embedded charts that update from data
- **Spreadsheet alternatives** with richer formatting
- **Database frontends** with custom views and workflows

## Comparison with Current Vivafolio

| Aspect | Current Vivafolio | Future `.viv` Format |
|--------|-------------------|---------------------|
| **Primary use case** | Interactive programming | Knowledge management & collaboration |
| **File format** | Programming language source | Markdown document |
| **Target audience** | Developers | Teams, knowledge workers |
| **Block context** | Within code | Within documents |
| **Data storage** | `gui_state!()` constructs | Embedded data blocks in Markdown |

## Technical Considerations

### File Structure

A `.viv` file might look like:

```markdown
---
title: Project Tasks
tags: [project, planning]
---

# Project Tasks

## Overview
This is our project task tracker.

<!-- vivafolio_block: kanban-board -->
{
  "blockType": "https://blockprotocol.org/@blockprotocol/types/block-type/kanban-board/",
  "entityId": "project-tasks",
  "data": {
    "columns": [...],
    "tasks": [...]
  }
}
<!-- /vivafolio_block -->

## Next Steps
- [ ] Complete feature A
- [ ] Review PR #123
```

### Integration Points

- **VS Code extension**: Render blocks inline within Markdown documents
- **Block Protocol**: Leverage existing block ecosystem
- **Indexing service**: Track entities across documents
- **LSP integration**: Provide completions, validation, and hover info

## Migration Path

When `.viv` format is implemented:
1. Existing test files will continue using `.mocklang` extension
2. New notebook-style documents will use `.viv` extension
3. Clear documentation will distinguish between:
   - `.mocklang` - Mock language for testing
   - Programming language files - Code with embedded blocks
   - `.viv` - Interactive Markdown notebooks

## Timeline

**Current Status**: Not implemented
**Next Steps**:
1. Complete core Vivafolio functionality for programming languages
2. Gather user feedback on block ecosystem
3. Design `.viv` format specification
4. Prototype Markdown parsing and block embedding
5. Build out collaboration features

## References

- [Vivafolio Overview](spec/Vivafolio-Overview.md) - Core Vivafolio vision
- [Coda and Notion Blocks POC](Coda-and-Notion-Blocks-POC.md) - Inspiration for data-centric features
- [Block Protocol](https://blockprotocol.org/) - Standard for embeddable components

---

**Note**: This is a forward-looking document describing a planned feature. The `.viv` extension is currently reserved and should not be used for other purposes.
