// Example demonstrating vivafolio_data!() construct for task management
// This file shows how to embed table-like data directly in source code

vivafolio_data!("project_tasks", r#"
Task Name,Assignee,Status,Priority,Due Date
Implement authentication,Alice,In Progress,High,2025-09-20
Design database schema,Bob,Completed,Medium,2025-09-15
Write API documentation,Charlie,Not Started,Low,2025-09-25
Setup CI/CD pipeline,Alice,In Progress,High,2025-09-22
User acceptance testing,Diana,Not Started,Medium,2025-09-30
"#);

// You can have multiple data tables in the same file
vivafolio_data!("team_members", r#"
Name,Role,Department,Start Date
Alice,Senior Developer,Engineering,2023-01-15
Bob,Database Administrator,Engineering,2022-08-20
Charlie,Technical Writer,Documentation,2024-03-10
Diana,QA Engineer,Testing,2023-11-05
"#);

// Regular code continues below...
fn main() {
    println!("Hello, Vivafolio!");
}
