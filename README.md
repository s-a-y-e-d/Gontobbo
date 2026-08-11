# Gontobbo

Gontobbo is a Bengali-first academic operating system for tracking syllabus progress, planning daily study, managing revision, and keeping a durable study history.

It is designed as an operational study system, not a gamified learning app. The main question the app answers is simple: what is done, what is left, what needs revision, and what should be studied today?

## What It Does

- Track subject-wise syllabus progress.
- Organize subjects into chapters and concepts.
- Configure different tracker columns per subject, such as MCQ, board questions, book reading, or class notes.
- Plan daily work through Todo and AI Planner flows.
- Manage spaced revision and due reviews.
- Keep paginated study logs for completed work and revision events.
- Configure dashboard widgets, weekly targets, coaching progress, appearance, and subject settings.

## Product Areas

- **Dashboard**: daily workload, syllabus completion, progress charts, subject summaries, and configurable widgets.
- **Subjects**: subject cards, dynamic tracker configuration, exam weight, colors, icons, and progress summaries.
- **Subject page**: chapter-level tracker table split between next-term and full syllabus.
- **Chapter page**: concept-level tracker table, concept progress, todo actions, and revision actions.
- **Study Target**: one active, titled date-range target that turns selected chapters' unfinished concept trackers into daily Todo work.
- **Todo**: agenda and calendar views for manual tasks, study items, and planner suggestions.
- **AI Planner**: date-based study suggestions that can be accepted into Todo.
- **Revision**: overdue, due-today, and upcoming concept reviews.
- **Logs**: paginated study activity history with filters.
- **Settings**: planner priorities, weekly targets, dashboard widgets, theme, revision defaults, and subject overview.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Convex backend and database
- Clerk authentication
- Tailwind CSS
- next-themes
- Recharts
- Vitest and convex-test

## Architecture

Gontobbo is schema-driven. Subjects define tracker configuration arrays, and the UI renders tracker columns from those configs instead of hardcoding task types.

The central model is `studyItems`:

- Chapter-level tasks have no `conceptId`.
- Concept-level tasks include a `conceptId`.
- Progress, completion, estimated minutes, review state, and weakness metadata live on `studyItems`.
- Chapters and concepts are structural records only. They should not store progress state.

Study items are created lazily:

1. A user opens a subject page.
2. The app checks the subject's `chapterTrackers`.
3. Missing chapter-level `studyItems` are created for each chapter and tracker key.
4. The same pattern is used on chapter pages for concept-level trackers.

This keeps tracker behavior flexible while avoiding unnecessary pre-population.

## Performance Notes

Convex bandwidth is a core product constraint in this repo.

- Prefer user-scoped indexes for authenticated data.
- Avoid broad unbounded reads in public queries.
- Use pagination for feeds and logs.
- Use snapshot-style reads for heavier, lower-freshness screens.
- Use live subscriptions only where real-time updates materially improve the experience.
- Return narrow payloads instead of full documents when the UI only needs a few fields.
- Use summary or digest tables for repeated dashboard/search-style reads.

Before changing Convex reads or writes, read:

- `convex/schema.ts`
- `convex/_generated/ai/guidelines.md`
- `AGENTS.md`

## Project Structure

```text
app/                 Next.js App Router routes
components/ui/       Generic reusable UI components
components/features/ Domain-specific feature components
convex/              Convex schema, queries, mutations, tests, and helpers
public/              Static assets
DESIGN.md            Visual design system
FEATURES.md          Product feature overview
AGENTS.md            Coding and architecture guidelines
```

There is intentionally no `src/` directory.

## Getting Started

Install dependencies:

```bash
bun install
```

Set up environment variables in `.env.local`:

```bash
NEXT_PUBLIC_CONVEX_URL=
CLERK_JWT_ISSUER_DOMAIN=
```

Then run the app:

```bash
bun run dev
```

Open `http://localhost:3000`.

In a separate terminal, run Convex development tooling when working on backend functions:

```bash
npx convex dev
```

## Scripts

```bash
bun run dev      # Start the Next.js dev server
bun run build    # Build the app
bun run start    # Start the production build
bun run lint     # Run ESLint
bun run test     # Run Vitest tests
```

## Development Rules

- Keep UI copy mostly Bengali, with English where it makes technical sense.
- Keep code identifiers, types, schemas, and comments in English.
- Do not hardcode subject-specific tracker columns.
- Do not store completion or revision state on chapters or concepts.
- Componentize feature work instead of putting large logic blocks directly in route pages.
- Use Convex indexes and bounded reads for normal user paths.
- Read the local Next.js docs under `node_modules/next/dist/docs/` before using unfamiliar or version-sensitive APIs.

## Design Direction

The interface is quiet, airy, and study-focused:

- White/minimal surfaces
- Green accent
- Soft borders
- Pill-shaped controls
- Responsive desktop sidebar and mobile bottom navigation
- Dark mode support
- PWA support

See `DESIGN.md` for the full design system.
