# AGENT.md - Gontobbo Coding Guidelines

> This file acts as the constitution for AI coding agents working on the Gontobbo project. Read this before modifying the codebase.

## Project Identity
- **Project:** Gontobbo (Academic Operating System)
- **Goal:** A personal study system to track syllabus progress, manage revisions, and organize academic goals.
- **Architecture:** Schema-Driven Study Tracking. Subjects, chapters, and concepts share common database tables. Specific tracking tasks (like MCQ, Board Questions, Class Notes) are defined dynamically via configuration objects, not hardcoded table columns.
- **Tech Stack:** Next.js (App Router), Convex (Backend & Database), Tailwind CSS, TypeScript.

## Language & UI Content
- **User Interface:** Text labels and user-facing content should be a mix of English and Bengali, but **mostly Bengali**. Use Bengali for natural study terminology, but keep English where it makes sense technically.
- **Code Language:** Variables, function names, database schemas, component names, and comments MUST always be in English.

## File Structure & Organization
- **Root Level:** Do not use a `src/` directory. Keep `app/`, `components/`, and `convex/` at the root level.
- **Components Directory:**
  - `components/ui/` -> For "dumb" or generic, reusable UI components (e.g., Buttons, Inputs, standard Cards).
  - `components/features/` -> For complex, stateful, or domain-specific components (e.g., `DynamicTrackerTable`, `ChapterProgressCard`).
- **Modularity:** **Do not write everything on one page.** Always try to organize the codebase. Break down large files into smaller, focused components.

## TypeScript & Code Quality
- **Strict Interfaces:** Strictly define most of the interfaces and types. Avoid using `any`. Define clear shapes for Convex data returns and component props.
- **Next.js:** Use standard Next.js App Router conventions. There are no overly strict patterns to force, just use Server and Client components where they naturally fit best.

## AI Operational Rules (CRITICAL)
1. **Schema First:** ALWAYS verify the Convex schema (`convex/schema.ts`) and understand the data model before touching or modifying UI components.
2. **Componentize:** Never dump all logic into a single `page.tsx` file. Proactively create and abstract feature components into `components/features/`.
3. **No Hardcoded Subjects:** The application is schema-driven. Never hardcode logic specifically for "Physics" or "Chemistry". UI components must dynamically render tracking columns based on the config arrays stored in the database.


<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->