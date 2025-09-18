# What Coda & Notion actually do (the patterns you want to mimic)

* **Multiple database views over the same data** — table, board/kanban, calendar, timeline, gallery, list. You can group, filter, sort, and preview more content on cards; each view reflects the same items. ([Notion][1])
* **Per-database templates & page layouts** — Notion lets you define **database templates** (including nested templates) and **Layouts** that control how a row/page renders; this is effectively a “renderer block” that gets nested inside a view. ([Notion][2])
* **Sub-items & dependencies** — tasks can nest inside tasks and show on cards, boards, timelines, etc. (i.e., nested entities rendered within another entity’s card/page). ([Notion][3])
* **Property types that render as mini-blocks** — People (avatars), Status, Multi-select tags, Date/Date range, Files, Checkbox, Formula, Relation, Rollup, Button… these show up **inside** cards/rows and in detail pages. ([Notion][4])
* **Relations & rollups** — Notion relations link entities across databases; rollups aggregate related data and display it inline (counts, sums, %, etc.). ([Notion][5])
* **Coda views & connected views** — a “view is a mirror of a table”; edits in one view reflect everywhere (great for your multi-view sync tests). Coda also has **Cards**, **Calendar**, **Timeline**, and **Detail** views. ([help.coda.io][6])
* **Row layouts & subtables** — Coda lets you design a row’s “detail” layout, including **Subtables** to show related rows inline (strong nested rendering). ([help.coda.io][7])
* **Canvas column** — Coda’s “canvas in a cell” nests rich content (text, tables, buttons) **inside a table cell** with optional templates per row. ([help.coda.io][8])
* **People & progress visuals** — People columns render avatars; Coda has a **progress bar column**; both commonly appear inside cards/table cells. ([help.coda.io][9])

---

# Recommended POC Block Suite

## A) Core “View” Blocks (container blocks that **nest renderers**)

1. **TableViewBlock**

   * **What it shows:** Spreadsheet-like rows with configurable visible properties.
   * **Nested bits:** Renders **CellRenderer** blocks (People/Status/Tags/Date, etc.).
   * **Why:** Baseline Notion/Coda table behavior + property chips. ([Notion][1])
   * **Graph focus:** `queryEntities`, `updateEntity`, pagination; per-column editing.
   * **E2E idea:** Edit a Status and verify Kanban updates (see Multi-View Sync below).

2. **BoardViewBlock (Kanban)**

   * **What it shows:** Columns grouped by a property (e.g., Status).
   * **Nested bits:** **CardTemplateBlock** for card appearance; cards include People/Tags, etc.
   * **Why:** Mirrors Notion board & Coda cards view with grouping. ([Notion][1])
   * **Graph focus:** Batched `updateEntity` on drag/drop; fan-out to sibling views.

3. **CalendarViewBlock**

   * **What it shows:** Items by date/date range with quick create.
   * **Nested bits:** **CardTemplateBlock** in day cells.
   * **Why:** Common PM pattern; verifies date rendering & range logic. ([Notion][1])
   * **Graph focus:** Date normalization, time zone, range updates.

4. **TimelineViewBlock**

   * **What it shows:** Bars per item across date range; optional dependencies.
   * **Nested bits:** Row header uses **RowChipRenderer** (avatar + title + status).
   * **Why:** Matches Notion Timeline & Coda Timeline; good for heavy scrolling and virtualized rendering. ([Notion][1])
   * **Graph focus:** Efficient `aggregateEntities` by time window; dependency rollups.

5. **GalleryViewBlock / ListViewBlock**

   * **What it shows:** Card gallery or list cards with cover + key properties.
   * **Nested bits:** **CardTemplateBlock** defines fields, cover, badges.
   * **Why:** Notion “gallery/list”; easy to show nested property chips. ([Notion][1])

6. **DetailViewBlock (Row Page)**

   * **What it shows:** The “page” for a row with **LayoutTemplateBlock** and **SubtableRenderer** for related items.
   * **Why:** Mirrors Notion “Layouts” and Coda “Row layout” + “Subtables”. ([Notion][10])
   * **Graph focus:** Deep `queryEntities` for relations; inline create of children (sub-items).

## B) Property/Cell Renderer Blocks (the **nestable chips** on rows/cards)

7. **PersonChipBlock**

   * **What:** Renders one or many assignees with avatars and presence tooltip.
   * **Why:** Maps to Notion **Person** and Coda **People** columns. ([Notion][4])
   * **Graph:** `updateEntity` for assignment; optional mention in activity.

8. **StatusPillBlock**

   * **What:** To-do/In-Progress/Done style pill with conditional color.
   * **Why:** Matches Notion **Status** and common board grouping. ([Notion][4])
   * **Graph:** Inline picker updates; triggers re-grouping in BoardView.

9. **TagChipsBlock (Select/Multi-select)**

   * **What:** Colored tag chips; add/remove tags.
   * **Why:** Heavily used for categorization & grouping. ([Notion][4])

10. **DatePillBlock**

    * **What:** Date + range badge with quick “Today/Tomorrow/Next week”.
    * **Why:** Feeds Calendar/Timeline views; supports reminders. ([Notion][1])

11. **ProgressBarPropertyBlock**

    * **What:** Inline % bar (computed or set); colors via rules.
    * **Why:** Mirrors Coda **Progress bar column**; commonly shown on cards. ([help.coda.io][11])

12. **FilePreviewPropertyBlock**

    * **What:** Thumbnail/file chip with download/open.
    * **Why:** Matches Notion Files property; gallery cover source. ([Notion][4])

13. **CheckboxPropertyBlock**

    * **What:** Lightweight completion or boolean flags.
    * **Why:** Often combined with rollups (e.g., % complete). ([Notion][4])

## C) Relationship & Computation Blocks (exercise **aggregateEntities**)

14. **RelationCellBlock**

    * **What:** Renders related items as inline chips or a mini list; supports add/remove.
    * **Why:** Notion **Relation** property; Coda **Relation column**. ([Notion][5])
    * **Graph:** Two-way linking semantics; pagination of related sets.

15. **RollupSummaryBlock**

    * **What:** “X of Y done”, sum/budget, next deadline — computed from related rows.
    * **Why:** Notion **Rollup**; perfect to validate `aggregateEntities` & pagination. ([Notion][5])
    * **Graph:** Host implements aggregate helpers; block requests aggregations.

16. **FormulaDisplayBlock**

    * **What:** Computed value renderer with error states & dependency tracking.
    * **Why:** Mirrors Notion formulas; good for change propagation. ([Notion][4])

## D) Template/Appearance Blocks (your “renderer inside a view”)

17. **CardTemplateBlock**

    * **What:** Declarative schema for card face (title, cover, chips, badges).
    * **Why:** Matches **Notion Layouts** & Coda **Card customization**; mount this **inside** Board/Gallery/List/Table. ([Notion][10])
    * **Graph:** Pure read; emits `updateEntity` on inline edits (e.g., status, tags).

18. **LayoutTemplateBlock (Row/Page Layout)**

    * **What:** Sectioned detail layout (description, properties, related subtables).
    * **Why:** Mirrors Notion **Layouts** + Coda **Row layouts**. ([Notion][10])

19. **SubtableRendererBlock**

    * **What:** Shows related children as a small table/list embedded in a row page.
    * **Why:** Coda **Subtables**; Notion **Sub-items** on a card/page. ([Notion][3])

20. **CanvasCellBlock**

    * **What:** Rich text/blocks inside a table cell (checklists, images, mini-tables).
    * **Why:** Coda **Canvas column**; tests deep nested editing. ([help.coda.io][8])

## E) Collaboration & Activity Blocks

21. **CommentsPaneBlock**

    * **What:** Inline comments thread for an entity or property, with @-mentions and counts.
    * **Why:** Notion comments/mentions; Coda row comments exist too. ([Notion][12])

22. **ReactionsBarBlock**

    * **What:** 👍 / ✅ / 🔥 counters on a row or comment.
    * **Why:** Mirrors Notion reactions; simple `updateEntity` deltas. ([Notion][13])

## F) Action Blocks

23. **ButtonPropertyBlock**

    * **What:** Inline button to run host actions (e.g., “Create sub-item”, “Archive”).
    * **Why:** Notion **Button** property & Coda **Buttons**; good for permission & side-effects. ([Notion][4])

---

# How to stage them in your POC

* **Stage 1 – Cell Chips in TableView:** PersonChip, StatusPill, TagChips, DatePill, ProgressBarProperty. Prove inline `updateEntity` and multi-view sync (BoardView listening). ([help.coda.io][6])
* **Stage 2 – Relations & Rollups:** RelationCell + RollupSummary in TableView & DetailView; verify `aggregateEntities` + pagination via your Graph service hooks. ([Notion][5])
* **Stage 3 – Templates as Nested Blocks:** Make BoardView consume **CardTemplateBlock**; make DetailView consume **LayoutTemplateBlock** and **SubtableRendererBlock** to replicate Notion Layouts/Coda Row Layouts. ([Notion][10])
* **Stage 4 – Alternate Views:** CalendarView, TimelineView, GalleryView, ListView bound to the **same** entities. Drive edits in one view and assert cross-view updates (you already have Playwright patterns for this). ([Notion][1])
* **Stage 5 – Rich Nesting:** CanvasCellBlock inside TableView to demonstrate deep nesting (table → cell → canvas → mini-table). ([help.coda.io][8])
* **Stage 6 – Collaboration:** CommentsPane + ReactionsBar with per-entity threads and counts.

---

## Why this set fits Block Protocol validation

* **Nesting & composition:** Views (containers) **nest** template/renderer blocks, which **nest** property chips — exactly the composition patterns you see in both tools. ([Notion][1])
* **Multi-view sync:** Connected views over the same entities are core to Coda/Notion; your Graph service fan-out and Playwright checks directly mirror that. ([help.coda.io][6])
* **Aggregations:** Rollups and timeline/calendar windows force `aggregateEntities` & pagination semantics in the host (already on your roadmap). ([Notion][5])
* **Templates:** Database templates/layouts map cleanly to **Template blocks** in your host, proving how “appearance definitions” can be packaged and reused. ([Notion][2])
* **Deep nesting:** Canvas-in-cell and subtables prove that nested rendering can cross multiple isolation boundaries (inline, iframe, or HTML-template bridges). ([help.coda.io][8])

If you want, I can slot these into your milestone list with quick acceptance checks (selectors, expected text, and `graph/update` assertions) so you can drop them into `apps/blockprotocol-poc/tests/…` without re-planning.

[1]: https://www.notion.com/help/guides/using-database-views "Using database views"
[2]: https://www.notion.com/help/database-templates "Database templates – Notion Help Center"
[3]: https://www.notion.com/help/tasks-and-dependencies "Sub-items & dependencies – Notion Help Center"
[4]: https://www.notion.com/help/database-properties "Database properties – Notion Help Center"
[5]: https://www.notion.com/help/relations-and-rollups?utm_source=chatgpt.com "Relations & rollups – Notion Help Center"
[6]: https://help.coda.io/en/articles/772883-create-connected-table-views?utm_source=chatgpt.com "Create connected table views | Coda Help Center"
[7]: https://help.coda.io/en/articles/2484388-customize-row-layouts?utm_source=chatgpt.com "Customize row layouts | Coda Help Center"
[8]: https://help.coda.io/en/articles/5979455-canvas-column-type "Canvas column type | Coda Help Center"
[9]: https://help.coda.io/en/articles/1243526-people-column-format?utm_source=chatgpt.com "People column format | Coda Help Center"
[10]: https://www.notion.com/help/layouts "Layouts – Notion Help Center"
[11]: https://help.coda.io/en/articles/6387840-progress-bar-column-type?utm_source=chatgpt.com "Progress bar column type | Coda Help Center"
[12]: https://www.notion.com/help/comments-mentions-and-reminders?utm_source=chatgpt.com "Comments, mentions & reactions – Notion Help Center"
[13]: https://www.notion.com/help/guides/comments-and-discussions?utm_source=chatgpt.com "Comments & discussions - Notion"
