# Gontobbo Web App Overview

Gontobbo is an academic operating system for managing syllabus progress, daily study planning, revision, study logs, and personal study targets. It is designed as a practical study management tool, not a gamified learning app.

The app is built for students who need to see what is left, what is done, what needs revision, and what should be studied today.

## Core Purpose

Gontobbo helps a student:

- Track subject-wise syllabus progress.
- Break subjects into chapters and concepts.
- Track different task types such as MCQ, board questions, class work, and book reading.
- Plan daily study work using AI-generated suggestions.
- Maintain a Todo agenda and calendar.
- Manage spaced revision.
- Keep a durable study activity log.
- Configure subjects, trackers, weekly targets, term dates, dashboard widgets, and appearance.

## Main Navigation

The web app contains these main areas:

- Dashboard
- Subjects
- AI Planner
- Todo
- Revision
- Logs
- Settings

## Dashboard

The dashboard gives a high-level view of current academic progress and daily workload.

Features include:

- Today's Todo summary.
- Todo completion progress for day, week, and month.
- Syllabus completion overview.
- Next term syllabus completion.
- Full syllabus completion.
- Remaining time until next term exam.
- Progression rate chart comparing actual progress with required pace.
- Study volume/activity view for recent study history.
- Subject-wise progress summary.
- Effort vs exam weightage comparison.
- Configurable dashboard widgets from Settings.

## Subjects

The Subjects page shows all subjects with progress summaries.

Features include:

- View all subjects in one place.
- Add a new subject.
- Configure subject icon, theme color, and exam weight.
- Define chapter-level trackers for each subject.
- Define concept-level trackers for each subject.
- Show subject progress based on completed study items.
- Open individual subject pages.

## Subject Page

Each subject has its own syllabus-tracking page.

Features include:

- Subject header with total progress.
- Add new chapters.
- Separate table for next-term exam syllabus.
- Separate table for full syllabus.
- Dynamic tracker columns based on the subject configuration.
- Chapter-level progress checkboxes.
- Concept completion summary per chapter.
- Chapter status: not started, in progress, or complete.
- Mark chapters as included/excluded from next term.
- Edit chapters.
- Delete chapters.
- Reset chapter progress.
- Open a chapter to manage concepts.

## Chapter Page

Each chapter has a concept-level tracking page.

Features include:

- Chapter header with progress.
- Concept list table.
- Dynamic concept tracker columns based on the subject configuration.
- Add concepts.
- Edit concepts.
- Delete concepts.
- Reset concept progress.
- Mark concept tracker items complete or incomplete.
- Add concept study tasks to today's Todo.
- Start concept revision.
- Return to the parent subject page.

## Dynamic Tracker System

Gontobbo does not hardcode task types like Physics MCQ or Chemistry Board Questions.

Instead:

- Each subject stores tracker configuration arrays.
- `chapterTrackers` define chapter-level task columns.
- `conceptTrackers` define concept-level task columns.
- Study tasks are matched to trackers by their `type` key.
- The UI builds tables dynamically from these tracker configs.

This means each subject can have different task types and durations.

## Study Items

`studyItems` are the main source of truth for progress.

They store:

- Subject, chapter, and optional concept relation.
- Tracker type.
- Title.
- Estimated minutes.
- Completion status.
- Completion score.
- Last studied date.
- Next review date.
- Repetition level.
- Ease factor.
- Weakness score.

Chapter-level tasks have no `conceptId`.

Concept-level tasks include a `conceptId`.

## Lazy Study Item Creation

Study items are created only when needed.

The app creates missing study items when:

- A user opens a subject page.
- A user opens a chapter page.

This keeps the database smaller and avoids pre-populating unnecessary records.

## Todo

The Todo area helps plan and schedule study work.

Features include:

- Agenda view.
- Calendar view.
- Day and week calendar modes.
- Date strip navigation.
- Go to previous range, next range, or today.
- Add manual tasks.
- Add study-item tasks.
- Add concept-review tasks.
- Set task duration.
- Set optional start time.
- Complete or uncomplete tasks.
- Edit tasks.
- Search study items when creating Todo tasks.
- Use subject colors for study tasks.
- Accept AI planner suggestions into Todo.

## AI Planner

The AI Planner suggests what to study for a selected day.

Features include:

- Pick a date.
- Enter available study minutes.
- Add optional planning comments.
- Generate study suggestions.
- Suggest unfinished study items.
- Suggest concept reviews.
- Show generated suggestions with subject and chapter context.
- Accept suggestions into Todo.
- Dismiss suggestions.
- Track generation count and latest generated plan details.
- Configure subject priority in Settings.

## Revision

The Revision page manages spaced revision for concepts.

Features include:

- Overdue revision count.
- Today's revision count.
- Upcoming 7-day revision count.
- Filter revision by subject.
- Show overdue and due-today review items.
- Show upcoming review items.
- Start a concept review.
- Rate review difficulty.
- Reschedule review date.
- Track review count, next review date, and repetition level.
- Record revision activity into study logs.

## Study Logs

The Logs page is a durable study activity feed.

Features include:

- Paginated study log feed.
- Group logs by date.
- Filter logs by subject.
- Filter logs by event type.
- Supported events:
  - Study item completed.
  - Study item uncompleted.
  - Concept review.
- Show subject and chapter snapshots.
- Show concept snapshots when available.
- Show time spent.
- Edit minutes for editable logs.
- Show review rating for concept reviews.

## Settings

Settings controls the academic and app behavior.

Sections include:

- Dashboard
- Planner
- Weekly targets
- Coaching progress
- Appearance
- Revision
- Subjects
- Future data tools
- Future notifications
- Future account settings
- Future backup tools

Features include:

- Set term start date.
- Set next term exam date.
- Turn dashboard widgets on or off.
- Set subject planner priority.
- Mark weekly target chapters and concepts.
- Track coaching/school progress per chapter.
- Switch theme between light, dark, and system.
- Install the app as a PWA when supported.
- Set default revision minutes.
- View subject tracker overview.

## Authentication And Users

The app uses Clerk authentication and Convex user records.

User-related features include:

- Signed-in user state.
- User profile metadata.
- Owner/viewer roles.
- Multi-user data ownership.
- Legacy workspace compatibility.
- Onboarding state.
- Class level selection.

## Data Model

The main Convex tables are:

- `users`: authenticated user records and roles.
- `subjects`: subject metadata and tracker configuration.
- `chapters`: structural chapter records.
- `concepts`: structural concept records and revision metadata.
- `studyItems`: progress and revision source of truth.
- `studyLogs`: immutable study history.
- `plannerSessions`: daily planner generation sessions.
- `plannerSuggestions`: generated AI planner suggestions.
- `plannerSubjectPreferences`: subject priority for planning.
- `weeklyTargets`: selected weekly target chapters/concepts.
- `coachingProgress`: coaching status per chapter.
- `todoTasks`: daily Todo and calendar tasks.
- `settings`: per-user key-value app settings.

There are also summary and migration tables for performance-sensitive features.

## Performance Design

The app is built with Convex bandwidth limits in mind.

Important performance choices:

- Snapshot queries for heavier screens.
- Live queries only where fresh updates matter.
- Indexed user-scoped reads.
- Paginated logs.
- Search digests for Todo study item search.
- Summary tables for dashboard and syllabus progress.
- Lazy creation instead of bulk pre-population.
- Backfill jobs for summary/search helper tables.

## UI And Design

The design is clean, airy, and study-focused.

Design direction:

- Bengali-first interface text.
- White and minimal surfaces.
- Green accent color.
- Pill-shaped buttons and inputs.
- Soft borders.
- Minimal shadows.
- Material Symbols icons.
- Responsive layout for desktop and mobile.
- Sidebar navigation on desktop.
- Bottom navigation on mobile.
- Dark mode support.
- PWA support.

## Tech Stack

Gontobbo uses:

- Next.js App Router
- React
- TypeScript
- Convex backend and database
- Clerk authentication
- Tailwind CSS
- Recharts for charts
- next-themes for theme switching
- Vitest and convex-test for testing
- PWA manifest and icons

## Current Future/Coming Soon Areas

The Settings UI already includes placeholders for:

- Data management
- Notifications
- Account settings
- Backup/cloud sync

These are marked as future sections and are not fully active yet.

## One-Line Product Description

Gontobbo is a Bengali-first academic operating system that helps students track syllabus progress, plan daily study, manage revision, and keep a complete history of their study work.

