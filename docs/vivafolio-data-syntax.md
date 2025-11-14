# Vivafolio Data Syntax Guide

## Overview

The `vivafolio_data!()` construct allows you to embed table-like data directly in your source code. The Vivafolio LSP server will automatically detect these constructs and create interactive Block Protocol table blocks for editing the data.

## Syntax

```rust
vivafolio_data!("entity_id", r#"
Column1,Column2,Column3
Value1,Value2,Value3
Value4,Value5,Value6
"#);
```

## Components

1. **Entity ID**: A unique identifier for the data table (used as the base for generated entity IDs)
2. **Raw String Literal**: Contains the CSV-style table data with headers in the first row
3. **CSV Format**: Comma-separated values with one row per line

## Features

### Automatic Block Creation
When the LSP server detects a `vivafolio_data!()` construct, it automatically:
- Parses the CSV table data
- Creates a table-view Block Protocol block
- Converts each row to an individual entity
- Generates a DSL module for handling edits

### Interactive Editing
The generated table block provides:
- Visual table interface
- Inline cell editing
- Add new row functionality
- Real-time synchronization with the source code

### DSL Module Support
Each `vivafolio_data!()` construct generates a DSL module that defines:
- `updateEntity`: Handle cell value changes
- `createEntity`: Handle new row creation
- `deleteEntity`: Handle row deletion

## Examples

### Task Management (Rust)
```rust
vivafolio_data!("project_tasks", r#"
Task Name,Assignee,Status,Priority,Due Date
Implement authentication,Alice,In Progress,High,2025-09-20
Design database schema,Bob,Completed,Medium,2025-09-15
Write API documentation,Charlie,Not Started,Low,2025-09-25
"#);

> **Header normalization**
>
> When Vivafolio ingests `vivafolio_data!()` constructs (or CSV files), header names are
> normalized before indexing or editing: they are trimmed, lowercased, and whitespace is
> converted to underscores (for example, `Task Name` becomes `task_name`). Editing modules
> accept both the original and normalized forms, but new integrations should rely on the
> normalized keys to avoid casing mismatches.
```

### Inventory Management (Python)
```python
vivafolio_data!("product_inventory", r#"
Product Name,SKU,Category,Stock Quantity,Unit Price
Wireless Mouse,WMS-001,Electronics,150,25.99
Mechanical Keyboard,KBD-002,Electronics,75,89.99
USB Cable,USB-003,Accessories,300,12.50
"#);
```

### Meeting Schedule (JavaScript)
```javascript
vivafolio_data!("meeting_schedule", r#"
Meeting Title,Date,Time,Duration,Attendees
Sprint Planning,2025-09-23,09:00,2 hours,Alice,Bob,Charlie
Code Review,2025-09-23,14:00,1 hour,Alice,Diana
"#);
```

## Generated Entities

For a table with entity ID `my_table`:
- Row 0 becomes entity: `my_table-row-0`
- Row 1 becomes entity: `my_table-row-1`
- etc.

Each entity contains properties corresponding to the column headers.

## Block Protocol Integration

The generated blocks follow the Block Protocol specification:
- Block Type: `https://blockprotocol.org/@blockprotocol/types/block-type/table-view-block/`
- Entities: One per table row with column data as properties
- DSL Module: Embedded for source code synchronization

## Error Handling

The LSP server validates table syntax and reports errors for:
- Missing headers
- Inconsistent column counts
- Malformed CSV data

Invalid constructs will still generate blocks but with error information for debugging.

## Best Practices

1. Use descriptive entity IDs that reflect the data purpose
2. Ensure consistent column counts across all rows
3. Use raw string literals (`r#""#`) to avoid escaping issues
4. Keep table sizes reasonable for performance
5. Use clear, descriptive column headers

## Language Support

Currently supported in:
- Rust (with `r#""#` raw strings)
- Python (with triple-quoted strings)
- JavaScript (with template literals)
- Any language supporting multi-line string literals
