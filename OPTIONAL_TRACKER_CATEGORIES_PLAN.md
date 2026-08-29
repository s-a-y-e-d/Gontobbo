# Optional Tracker Categories — Implementation Plan

## Confirmed product rules

- A tracker category can be marked **optional per subject**, for both chapter trackers and concept trackers.
- The setting lives only in the existing **Edit Subject** tracker editor. Global/default tracker settings and onboarding presets remain unchanged; new trackers are required by default.
- Optional tracker items remain real, completable study work. They may still appear in planner suggestions, Todo, and Study Targets.
- Optional tracker completion must not affect syllabus completion, subject/chapter/concept status, targets, pacing/progression, or automatic revision eligibility/scheduling.
- Optional tracker completion must continue to appear in the Dashboard **Study Volume** card only: its total activities, active days, and 90-day heatmap. No other analytics should use optional completion as syllabus progress.
- A concept becomes eligible for its first automatic revision when all of its **required** concept trackers are complete. Optional trackers neither block nor trigger this.
- If every tracker at a level is optional, that level contributes no numerator or denominator to syllabus completion and does not auto-unlock revision.
- Changing a category in either direction recalculates the affected subject immediately from the user’s point of view. Existing revision history and already-scheduled reviews remain intact; newly required-complete concepts that have never entered revision are auto-unlocked.

## Data model and shared classification

1. Extend the tracker-config object in `convex/schema.ts` with `isOptional: v.optional(v.boolean())` for both `subjects.chapterTrackers` and `subjects.conceptTrackers`.
   - Omitted means `false`, preserving every existing subject and every new preset as required.
   - Do **not** copy this flag onto `studyItems`: optionality belongs to the subject’s current tracker configuration, so changing the category takes effect without rewriting each item.
   - Keep `trackerDefaults` and onboarding/default tracker types unchanged unless they must accept the optional field structurally. No defaults UI is added.

2. Add one small shared server-side helper (for example `convex/trackerRequirements.ts`) that receives a subject plus the tracker level and returns required tracker keys / `isTrackerOptional`.
   - A chapter-level item is classified against `chapterTrackers`; a concept-level item against `conceptTrackers`.
   - Use the same helper in every completion, target, planner, and revision path. Do not repeat `tracker.isOptional !== true` checks throughout the codebase.
   - An item whose key is no longer configured is not treated as required progress; normal tracker removal continues to delete its item through the existing flow.

## Edit Subject user interface

3. Update `components/features/EditSubjectModal.tsx` types, local state, key-normalization, and save payloads to preserve `isOptional`.
   - Add a clear Bengali optional toggle for every chapter and concept tracker row, defaulting to off for new rows.
   - Keep editing the label, duration, removal, and key-deduplication behavior intact.
   - Explain locally that optional work remains usable but is excluded from syllabus progress and revision.
   - On save, retain the existing snapshot refresh/error handling so the table and dashboard do not display stale category semantics.

4. Surface the state in the subject and chapter tracker-table headers with a compact `ঐচ্ছিক` label/icon, without disabling the checkbox.
   - Preserve the current completion control and all light/dark hover, focus, disabled, and selected states.
   - Do not hide optional categories: the user must still be able to complete them and find them in planning flows.

## Required-only summaries and read paths

5. Keep the existing all-item fields in `studyItemChapterStats` and `studyItemConceptStats` for compatibility, and add optional required-only fields such as `requiredTotalItems` and `requiredCompletedItems`.
   - Populate the required-only values from configured required keys, while all-item fields continue to describe all study items.
   - Update `studyItemCompletionDayStats` (used by Progression Rate) to record required-item completions only. Study Volume does not read this table.
   - `syllabusStudyItemCells` continues to represent every visible checkbox; its `trackerKey` plus the live subject config determines whether a cell is required.

6. Update the summary builders in `convex/syllabusSummaries.ts` and dashboard-stat helpers in `convex/dashboardStudyItemStats.ts` to calculate both representations consistently.
   - Rebuild functions must load the owning subject once, classify items with the shared helper, and calculate the required-only fields without adding per-item subject lookups.
   - The direct completion toggle path must increment/decrement required-only counters only for required items; it must still write a normal study log and Todo search digest for optional items.
   - Preserve bounded, user-scoped existing reads and summary-table reads. Do not introduce a dashboard-wide `studyItems` scan.

7. Switch formal progress consumers to required-only values, with a safe fallback while a derived summary is not yet refreshed.
   - `convex/queries.ts`: subject cards, subject table status, chapter status, concept completion counts, syllabus totals, and completion percentages.
   - `convex/dashboardQueries.ts`: subject progress, next-term completion, pacing, progression, urgency, and any formal completion totals.
   - `convex/plannerQueries.ts` and `convex/studyTargets.ts`: chapter/concept target-complete checks.
   - Fallback calculations must use the live tracker config and cells/items, rather than interpreting a missing required-only field as zero.
   - A zero-required row is omitted from denominator calculations and reports no automatic-ready state.

8. Leave Dashboard Study Volume intentionally unchanged in `convex/dashboardQueries.ts`.
   - It already reads immutable `studyLogs` and counts `study_item_completed` and `concept_review` events for `totalActivities`, `activeDays`, and heatmap intensity.
   - Optional item completion continues to create its normal `study_item_completed` log, so it appears in exactly this card as requested.
   - Do not let the required-only daily summary feed this card.

## Revision, planner, Todo, and targets

9. Replace the current “every concept study item is complete” auto-unlock condition in `toggleStudyItemCompletion` with “at least one required concept tracker exists and every required concept item is complete.”
   - Completing or uncompleting an optional item never creates, clears, postpones, or advances a concept’s revision schedule.
   - Keep existing manual review/reschedule behavior unchanged; this change only controls tracker-derived automatic eligibility and automatic revision surfaces.
   - Apply the same required-only definition to automatic revision search/dashboard/planner candidate checks so an optional category cannot affect their eligibility or priority.

10. Keep optional study items eligible for normal planner, Todo, and Study Target selection.
   - They remain valid study-item candidates and can be manually scheduled or accepted from suggestions.
   - Required-only completion statistics drive target completion, completion pressure, and “in progress”/ready signals, so optional work cannot make a target complete or create a revision/prioritization side effect.
   - Do not delete existing Todos, target-linked Todos, or planner suggestions merely because their category becomes optional.

## Safe config-change reconciliation

11. Extend `updateSubject` to treat a changed `isOptional` flag as a tracker configuration change even when keys have not changed.
   - Save the new config first and retain the existing removal behavior for genuinely removed keys.
   - Invalidate/rebuild required-only summary values for every chapter in the edited subject, not only chapters affected by deleted tracker items.
   - Reconcile concepts after the new config is active: if a concept has required work, all required work is complete, and it has no `nextReviewAt`, schedule its initial review. Never delete existing revision state during this reconciliation.

12. Make reconciliation bounded and migration-safe.
   - Reuse the repository’s cursor-based, self-scheduling summary-rebuild pattern rather than putting an unbounded subject-wide scan in the edit mutation.
   - Store a small per-subject rebuild status/version so readers can use the config-aware fallback until the required-only summary is current; the saved UI can refresh immediately from the same live config.
   - New writes must calculate required-only values before the queued rebuild completes. This prevents a config edit from producing a stale or incorrect completion/revision result.
   - Because `isOptional` is optional and defaults to required, no destructive data migration is needed. Derived fields receive a new, resumable backfill key; do not reuse an already-completed legacy backfill record.

## Test plan

13. Add focused Convex tests covering both tracker levels and legacy configs without `isOptional`:
   - Optional chapter and concept completions leave syllabus numerators/denominators, progress percentages, statuses, and targets unchanged.
   - Required completions still update those values; switching optional ↔ required recalculates existing marks correctly.
   - A concept with completed required trackers and unfinished optional trackers auto-unlocks once; completing only optional work does not; a zero-required concept does not auto-unlock.
   - Existing revision dates/history survive a config change, while a newly eligible unscheduled concept receives its first review.
   - Optional items remain planner/Todo/Study Target candidates but do not make completion-derived target/planner signals true.
   - Progression/pacing exclude optional completions, while the Study Volume total, active-day count, and heatmap include their completion log.
   - Fallback read behavior is correct while required-only summary fields/rebuild status are absent or stale.

14. Add/update UI coverage (where the project’s component-test setup supports it) for the Edit Subject optional toggle and header indicator. Manually inspect the affected table/modal in light and dark mode, including focus and hover states.

## Verification and rollout

15. Before deployment, run:
   - `npx.cmd tsc --noEmit`
   - the focused `convex/syllabusSummaries.test.ts`, `convex/dashboard.test.ts`, `convex/planner.test.ts`, `convex/todo.test.ts`, and `convex/studyTargets.test.ts` suites
   - `git diff --check`

16. Deploy only with explicit authorization. Then run the required-only derived-summary rebuild, verify its completion/status, and perform a read-only spot check with:
   - one subject having no optional categories (unchanged behavior),
   - one subject with an optional chapter tracker,
   - one concept with an optional concept tracker,
   - the Study Volume card showing the optional completion activity while formal progress and revision remain unaffected.

17. After rollout, watch the summary rebuild, subject/dashboard query latency, and mutation failures. The planned design uses existing summary tables and bounded rebuilds so optional-category changes do not add a broad reactive dashboard read.
