# Gontobbo - AI Coding Agent Setup Plan

This document serves as an implementation plan for an AI coding agent to set up **Version 1** of the Gontobbo Academic Operating System.

## Overview
Gontobbo is a personal academic operating system focused on structured study tracking and revision. 
- **Core Architecture:** Schema-Driven Study Tracking. All subjects share a common database schema, but the specific tasks tracked (e.g., MCQ, Board Questions, Book Reading) are driven by configuration objects stored on the Subject and Chapter levels.
- **Tech Stack:** Next.js (Frontend), Convex (Backend & Real-time Database).

---

## Phase 1: Project Initialization

1. **Scaffold Next.js App**
   - Initialize a new Next.js application using the App Router, TypeScript, and Tailwind CSS.
   - Command: `npx create-next-app@latest gontobbo --typescript --tailwind --eslint --app`

2. **Setup Convex**
   - Install Convex: `npm install convex`
   - Initialize Convex: `npx convex dev`
   - Set up the Convex provider in the Next.js `layout.tsx` to wrap the application in the `ConvexClientProvider`.

---

## Phase 2: Define the Convex Schema (`convex/schema.ts`)

The database must use a shared schema where the tracking columns are defined via configuration, not hardcoded table columns.

1. **`subjects` table**
   - `name` (string): e.g., "Physics", "Chemistry"
   - `description` (string)
   - `chapterTrackerConfig` (array of objects): Defines the columns for chapter-level tracking (e.g., `[{ id: 'mcq', label: 'MCQ', type: 'boolean' }, { id: 'board', label: 'Board Qs', type: 'boolean' }]`)

2. **`chapters` table**
   - `subjectId` (id("subjects"))
   - `title` (string)
   - `order` (number)
   - `conceptTrackerConfig` (array of objects): Defines the columns for concept-level tracking (e.g., `[{ id: 'class', label: 'Class', type: 'boolean' }, { id: 'book', label: 'Book', type: 'boolean' }]`)

3. **`concepts` table**
   - `chapterId` (id("chapters"))
   - `title` (string)
   - `order` (number)

4. **`chapterProgress` table**
   - Tracks a specific task for a chapter.
   - `chapterId` (id("chapters"))
   - `taskId` (string): Matches an `id` from `chapterTrackerConfig`
   - `status` (boolean | string): Completed or not.
   - `lastReviewed` (number): Timestamp for future AI revision logic.

5. **`conceptProgress` table**
   - Tracks a specific task for a concept.
   - `conceptId` (id("concepts"))
   - `taskId` (string): Matches an `id` from `conceptTrackerConfig`
   - `status` (boolean | string)
   - `lastReviewed` (number)

---

## Phase 3: Build Backend API (Convex Functions)

Create queries and mutations in `convex/` to interact with the schema:

1. **Queries (`convex/queries.ts`)**
   - `getSubjects`: Fetch all subjects.
   - `getSubjectDetails`: Fetch a subject and its `chapterTrackerConfig`.
   - `getChaptersBySubject`: Fetch chapters for a given subject.
   - `getConceptsByChapter`: Fetch concepts for a given chapter.
   - `getProgress`: Fetch progress records for a given list of chapters or concepts.

2. **Mutations (`convex/mutations.ts`)**
   - `updateChapterProgress`: Upsert a record in `chapterProgress` based on `chapterId` and `taskId`.
   - `updateConceptProgress`: Upsert a record in `conceptProgress` based on `conceptId` and `taskId`.
   - *(Optional for testing)* `seedData`: A mutation to populate initial test data for Physics and Chemistry with different tracker configs.

---

## Phase 4: Develop Dynamic UI Components

Build the frontend using the dynamic configuration from the database.

1. **Subject List (`app/page.tsx`)**
   - Fetch and display a list of all subjects.

2. **Subject View (`app/subject/[id]/page.tsx`)**
   - Fetch the subject's `chapterTrackerConfig`.
   - Fetch all chapters for the subject.
   - Render a table where rows are Chapters and columns are dynamically generated from `chapterTrackerConfig`.
   - Include a column that shows the rolled-up concept progress for that chapter (e.g., `Concepts: 12/20 Done`).
   - Clicking a tracker cell should trigger `updateChapterProgress`.

3. **Chapter View (`app/chapter/[id]/page.tsx`)**
   - Fetch the chapter's `conceptTrackerConfig`.
   - Fetch all concepts for the chapter.
   - Render a table where rows are Concepts and columns are dynamically generated from `conceptTrackerConfig`.
   - Clicking a tracker cell should trigger `updateConceptProgress`.

---

## Rules for the AI Coding Agent
1. **No Hardcoded Subjects:** Do not create separate tables or components for Physics vs. Biology. The UI must render solely based on the `*TrackerConfig` arrays.
2. **Atomic Commits:** Implement the schema first, verify it works with dummy data, and then build the UI components.
3. **Data Completeness:** Ensure that when progress is updated, the `lastReviewed` timestamp is recorded, as this is critical for the Phase 2/3 AI planner.
