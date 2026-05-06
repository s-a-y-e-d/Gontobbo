# The plan for calender view in the /todo page

**Phase 1**
Add a read-only calendar view for existing todos.

Scope:

- add `Day` view
- add `Week` view
- show timed tasks using `startTimeMinutes` and `durationMinutes`
- show untimed tasks in a separate “Unscheduled” area
- color events by subject
- click an event to open existing task details/edit flow
- switch between current agenda view and calendar view

Goal:

- users can see their study plan on a real timeline
- no new scheduling logic yet, only visualization

**Phase 2**
Make the calendar usable for planning.

Scope:

- create a task directly from an empty time slot
- move a task to another day/time
- resize a task to change duration
- drag unscheduled tasks into the calendar
- update task time from the calendar UI
- preserve current todo list behavior

Goal:

- the calendar becomes an actual scheduling surface, not just a display

**Phase 3**
Connect planner and calendar more tightly.

Scope:

- accept planner suggestions directly into a calendar slot
- show planner suggestions as “unscheduled recommendations”
- quick action: “place this into next free slot”
- warn when a day is overloaded
- suggest gaps where revision or weak subjects can fit

Goal:

- AI planning and calendar scheduling start feeling like one workflow

**Phase 4**
Add academic-specific intelligence.

Scope:

- subject-based color legend and filters
- conflict detection
- study load indicators per day/week
- exam proximity cues
- weekly target visibility on calendar
- revision due markers inside day/week view

Goal:

- make the calendar feel like Gontobbo, not a generic calendar clone

**Phase 5**
Polish and expand carefully.

Scope:

- optional month view
- keyboard shortcuts
- better mobile interaction
- recurring study blocks if you want them later
- animations and smoother drag/drop
- export or sync ideas only if they still fit the product

Goal:

- refinement, not feature bloat
