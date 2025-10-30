
### Markdown Block

Markdown in which any block can be embedded. There are two writing modes: 

- Mode 1 - as an extended VF (Vivafolio) markdown and 
- Mode 2 - as a rich text editor like in Coda. 

Do we see both editors next to each other or do we **switch with a MD/Preview button?** 

Mode 1

Mode 2 - What you see is what you get editor

Should there be a **constantly present menu** like in Google docs and [https://stackedit.io/](https://stackedit.io/) for editing text or should it be on demand pop-up menu on the right like in Coda? 

Within Markdown:
- headings - S,M,L
- Bold, italic, strike through
- font
- ordered list
- unordered list
- checklist
- Blockquote
- Code block
- Link
- Image
- Video 


 > [!tip] Today’s tasks
> - [ ] Read paper
> - [x] Go for a walk
 
### Collapsible content:

1. Headings
2. Lists
			* Folds nested items 
				- Nested item

Also checklists:

- Collapsible checklist. To be collapsible it should be nested 
	- [x] Review emails
	- [x] Update meeting notes
	- [x] Write design summary
	- [x] Push code changes

3. Blockquotes


> This is a long blockquote
> that spans multiple lines.
> It can be collapsed.

4. Indented blocks

Text before.
    This is an indented block of text
    that can fold if “Fold indent” is enabled.
Text after.

Text before. - This doesn't work because of tabs 
	- [x] Review emails
	- [x] Update meeting notes
	- [ ] Write design summary
	- [ ] Push code changes
Text after.[[Windows-Dev-Env-Status]]


> [!important] Obsidian 
> In Obsidian checklist is collapsible only if it is nested in a list or a heading 


### Other text&media
* Callout - a rectangle with icon and text 
* Emoji - supported by GFM 
* Mention Person - Person tag, on hover displays person details 
* File block - link to another file from the same workspace - supported by GFM

Here is how GLFM differs from standard MD : 
https://docs.gitlab.com/user/markdown/
When  typing  / a list of apps appear.
### View Blocks

- **TableViewBlock:** A table/spreadsheet view that displays data in a grid of rows and columns.
    
- **BoardViewBlock (Kanban):** A board view that groups items into columns based on a selected property (for example, grouping tasks by Status).
    
- **CalendarViewBlock:** A calendar view that places items on a calendar layout according to their date or date range (e.g. showing tasks on the days they are due).
    
- **TimelineViewBlock:** A timeline view that displays each item as a bar spanning its date range on a horizontal timeline, useful for visualizing schedules and dependencies. Possible to add dependencies of tasks. 
    
- **GalleryViewBlock:** A gallery view that presents items as a grid of cards, each showing a cover image and key properties.
    
- **DetailViewBlock (Row Page):** A detail view that displays the full content of a single row (item) on its own page, often with a custom layout of that row’s fields and any related subtables.
    

### Property and Cell Renderer Blocks

- **PersonChipBlock:** Displays person references (assignees or team members) as avatar chips or name pills within a cell.
    
- **StatusPillBlock:** Displays a status value as a colored pill/label (e.g. “To-Do”, “In Progress”, “Done”), often used to visually indicate an item’s state.
    
- **TagChipsBlock:** Displays one or multiple tags as colored chips that can be added or removed for categorizing or grouping items.
    
- **DateBlock:** Displays a date or date range as a pill-shaped badge, often with quick-select options like “Today”, “Tomorrow”, etc., for scheduling. When clicked a calendar appears to select date. Possible variations are:
		- date
		- date and time
		- time
    
- **ProgressBarPropertyBlock:** Displays a numeric progress value (such as a percentage) as an inline horizontal progress bar, often color-coded to indicate status.
- **ScalePropertyBlock** - Displays a discrete numerical scale (e.g. 1 to 5 stars or dots) for quickly rating or evaluating items.
- **FilePreviewPropertyBlock:** Displays an attached file or image as a small thumbnail or file chip, with options to preview or download the file.
    
    

### Relationship and Computation Blocks

- **RelationCellBlock:** Displays related items from another table as inline chips or a mini-list within a cell, and allows adding or removing those linked items.
    
- **RollupSummaryBlock:** Displays an aggregate summary calculated from related items – for example, showing “X of Y tasks done” or summing up values from linked records.
    
- **FormulaDisplayBlock:** Displays the result of a formula or computed field, updating automatically based on its dependencies and showing error states if the calculation fails.
    

### Template and Layout Blocks

- **CardTemplateBlock:** Defines the template layout for a “card” (such as what fields, images, or badges appear on an item’s card in a board or gallery view).
    
- **LayoutTemplateBlock (Row/Page Layout):** Defines a custom layout for a row’s detail page, organizing the item’s fields, text, and related subtables into sections on that page.
    
- **SubtableRendererBlock:** Displays a set of related items as an embedded table or list within another item’s page (for example, showing a table of sub-tasks on a parent task’s detail page).
    
- **CanvasCellBlock:** Embeds a mini rich-text canvas inside a table cell, allowing richly formatted content (text, checklists, images, even nested tables) to live inside a single cell.
    

### Collaboration and Activity Blocks

- **Comments Block:** Provides an inline comment thread pane for an item or document section, displaying comments (with @​-mentions and reply threads) associated with that context.
    
- **Reactions Block:** Displays interactive reaction icons (e.g. 👍, ✅, 🔥) with counters, allowing users to react to content or comments and see the number of reactions.
    

### Action Blocks

- **ButtonPropertyBlock:** Displays a clickable button in the document or table which can trigger a defined action or automation (for example, a button to create a new sub-item or mark an item as archived).
   To be decided: What kinds of buttons? 
### Data science blocks

* Line chart
* Pie chart
* Bar chart 

| Feature                    | Obsidian Flavored Markdown | GitLab Flavored Markdown | GitHub Flavored Markdown | Pandoc Markdown    | MultiMarkdown | Markdown Extra | Kramdown          | Markdown-it (with plugins) |
| -------------------------- | -------------------------- | ------------------------ | ------------------------ | ------------------ | ------------- | -------------- | ----------------- | -------------------------- |
| CommonMark compliant       | ✅ (base)                   | ✅                        | ✅                        | Partial (via mode) | ❌             | ❌              | ❌                 | ✅ (core)                   |
| Tables                     | ✅                          | ✅                        | ✅                        | ✅                  | ✅             | ✅              | ✅                 | ✅                          |
| Footnotes                  | ✅                          | ✅                        | ❌                        | ✅                  | ✅             | ✅              | ✅                 | ✅ (plugin)                 |
| Definition lists           | ❌                          | ✅                        | ❌                        | ✅                  | ❌             | ✅              | ✅                 | ✅ (plugin)                 |
| Task lists                 | ✅                          | ✅                        | ✅                        | ✅                  | ❌             | ❌              | ✅                 | ✅ (plugin)                 |
| Strikethrough              | ✅                          | ✅                        | ✅                        | ❌                  | ❌             | ❌              | ✅                 | ✅                          |
| Math (LaTeX)               | ✅                          | ✅                        | ❌                        | ✅                  | ✅             | ❌              | ✅                 | ✅ (plugin)                 |
| Citations/Bibliography     | ❌                          | ❌                        | ❌                        | ✅                  | ✅             | ❌              | ❌                 | ❌                          |
| Internal wiki links        | ✅ ([[link]])               | ❌                        | ❌                        | ❌                  | ❌             | ❌              | ❌                 | ❌                          |
| Embeds (note-to-note/file) | ✅ (![[link]])              | ❌                        | ❌                        | ✅ (via filters)    | ❌             | ❌              | ❌                 | ❌                          |
| Callouts / Admonitions     | ✅ (> [!NOTE])              | ✅ (custom blocks)        | ❌                        | ✅ (custom blocks)  | ❌             | ❌              | ✅ (custom blocks) | ✅ (plugin)                 |
| Diagrams (e.g. Mermaid)    | ✅                          | ✅                        | ❌                        | ❌ (via filters)    | ❌             | ❌              | ❌                 | ✅ (plugin)                 |
| Collapsible content        | ✅ (headings, lists)        | ✅ (HTML or block)        | ❌                        | ❌ (via filters)    | ❌             | ❌              | ❌                 | ✅ (HTML or plugin)         |
| HTML attribute support     | Limited                    | Partial                  | ❌                        | ✅                  | Limited       | ✅              | ✅                 | ✅                          |
| Block references           | ✅ (^block-id)              | ❌                        | ❌                        | ❌                  | ❌             | ❌              | ❌                 | ❌                          |
| Front matter (YAML)        | ✅                          | ✅                        | Partial (in Jekyll)      | ✅                  | ✅             | ✅              | ✅                 | ✅                          |
a² + b² = c²