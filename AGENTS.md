# AGENTS.md - Gontobbo Coding Guidelines

> Constitution for AI coding agents working on Gontobbo. Read before modifying the codebase.
> Last updated: 2025-04-25

---

## Project Identity

- **Project:** Gontobbo (গন্তব্য — Academic Operating System)
- **Owner:** Sayed Hasan, Dhaka, Bangladesh
- **Goal:** A personal study system to track syllabus progress, manage revisions, and organize academic goals. NOT a gamified learning app — this is an operational study system.
- **Tech Stack:** Next.js (App Router), Convex (Backend & Database), Tailwind CSS, TypeScript.

---

## Core Architecture: Schema-Driven Study Tracking

All subjects share common database tables. Tracking tasks (MCQ, Board Questions, Class Notes, etc.) are defined dynamically via **tracker config arrays** on the Subject — never hardcoded.

### The StudyItem Model

The `studyItems` table is the **single source of truth** for all progress, completion, and revision state.

- **Chapter-level task:** studyItem where `conceptId` is absent (e.g., "গতি — MCQ")
- **Concept-level task:** studyItem where `conceptId` is present (e.g., "বেগ — Book")
- **Chapters and concepts are structural only.** They hold names, ordering, and metadata — NO progress, NO revision state.

### How the UI Derives Progress

1. Read subject's `chapterTrackers` config → column headers
2. Query studyItems for that subject (where `conceptId` absent) → chapter-level cell data
3. Match each studyItem's `type` field to the config's `key` → place in correct cell
4. Aggregate concept-level studyItems per chapter → "Concepts: 3/8 done" summary column

### Lazy Creation

studyItems are created **on-demand**, not pre-populated:

1. User opens subject page → query chapters + existing studyItems
2. For each (chapter × trackerConfig.key) combo with no matching studyItem → batch-create
3. Same pattern on chapter pages for (concept × conceptTrackerConfig.key)

---

## Database Overview

| Table | Role | Stores Progress? |
|-------|------|:---:|
| `subjects` | Subject metadata + tracker configs | No |
| `chapters` | Structural grouping under subjects | No |
| `concepts` | Structural grouping under chapters | No |
| `studyItems` | **Every trackable task — single source of truth** | **Yes** |
| `studyLogs` | Immutable study session history | History |
| `plannerSessions` | Daily AI-generated plans | No |
| `settings` | Global key-value config | No |

### Key Schema Rules

- All dates use `v.number()` (Unix ms timestamps). Format to strings only in the UI layer.
- `settings.value` uses `v.union(v.string(), v.number(), v.boolean())` — no `v.any()`.
- Revision state lives on studyItems (`nextReviewAt`, `repetitionLevel`). Detailed history lives in `studyLogs`.
- The full schema is in `convex/schema.ts` — always read it before writing queries or mutations.

---

## Language & UI Content

- **User Interface:** Text labels and content should be mostly **Bengali** (বাংলা). Use English where it makes sense technically.
- **Code Language:** Variables, function names, schemas, component names, and comments MUST always be in **English**.

---

## File Structure & Organization

- **No `src/` directory.** Keep `app/`, `components/`, `convex/` at root.
- **Components:**
  - `components/ui/` → Generic, reusable "dumb" components (Button, Input, Card)
  - `components/features/` → Domain-specific, stateful components (DynamicTrackerTable, ChapterProgressCard)
- **Modularity:** Never write everything in one `page.tsx`. Break into focused components.

---

## TypeScript & Code Quality

- Strictly define interfaces and types. Avoid `any`.
- Define clear shapes for Convex data returns and component props.
- Use standard Next.js App Router conventions — no forced patterns, use Server/Client components where they naturally fit.

---

## AI Operational Rules (CRITICAL)

1. **Schema First:** ALWAYS read `convex/schema.ts` and understand the data model before touching UI components.
2. **Single Source of Truth:** Progress lives in `studyItems`. Never store completion or revision state on chapters or concepts.
3. **Componentize:** Never dump logic into `page.tsx`. Create feature components in `components/features/`.
4. **No Hardcoded Subjects:** UI must render tracker columns dynamically from config arrays. Never write Physics-specific or Chemistry-specific code.
5. **Lazy Creation:** studyItems are created when the user first visits a page, not when chapters/concepts are added.
6. **Convex Guidelines:** Always read `convex/_generated/ai/guidelines.md` before writing Convex code.
7. **Next.js Docs:** Read guides in `node_modules/next/dist/docs/` — APIs may differ from training data.

---

## Design Reference

See `DESIGN.md` for the full design system (colors, typography, components, spacing). Key points:

- Mintlify-inspired: white, airy, green accent (`#18E299`)
- Inter font family, Geist Mono for code/labels
- Full-pill radius (9999px) for buttons and inputs
- Borders at 5% opacity for separation, minimal shadows


<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->