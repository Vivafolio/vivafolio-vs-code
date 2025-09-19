// Example demonstrating vivafolio_data!() construct for scheduling
// This shows how to embed calendar/event data in JavaScript

vivafolio_data!("meeting_schedule", r#"
Meeting Title,Date,Time,Duration,Attendees,Room
Sprint Planning,2025-09-23,09:00,2 hours,Alice,Bob,Charlie,Room A
Code Review,2025-09-23,14:00,1 hour,Alice,Diana,Room B
Architecture Discussion,2025-09-24,10:00,1.5 hours,Alice,Bob,Charlie,Room A
Client Presentation,2025-09-24,15:00,1 hour,Alice,Diana,Room C
Team Retrospective,2025-09-25,16:00,45 minutes,All Team,Room A
"#);

vivafolio_data!("project_milestones", r#"
Milestone,Description,Due Date,Status,Owner
MVP Release,Initial product launch,2025-10-01,On Track,Alice
Beta Testing,User testing phase,2025-10-15,Planning,Bob
Documentation,Complete user guides,2025-10-20,Not Started,Charlie
Performance Optimization,Improve response times,2025-10-25,In Progress,Diana
"#);

// Regular JavaScript code continues...
function scheduleMeeting(title, date, time) {
    console.log(`Scheduling: ${title} on ${date} at ${time}`);
}

function checkConflicts(date, time) {
    // Function to check for scheduling conflicts
    return false; // Placeholder implementation
}

module.exports = {
    scheduleMeeting,
    checkConflicts
};
