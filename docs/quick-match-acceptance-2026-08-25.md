# Quick Match acceptance audit — 2026-08-25

This audit records the final pre-merge checks for the local Quick Match flow on `feature/local-decision-engine-v2`.

## Automated / source-backed checks

- CI #304 passed before the acceptance audit changes.
- Catalogue contains 11,909 course records.
- Profession-relevant catalogue coverage found during the audit:
  - Software / computing terms: 571 courses.
  - Nursing / nurse terms: 184 courses.
  - Teaching / education terms: 661 courses.
  - Psychology / psychological terms: 395 courses.
  - Law / legal / Juris Doctor terms: 712 courses.
- Profession-specific career guardrails are present for nursing, teaching, psychology, law and other regulated/specialised careers so broad health/business/location/budget matches cannot freely outrank profession-specific study on career relevance alone.
- Entry-requirement evidence remains intentionally sparse: 16 course-specific records. Missing entry evidence is shown as not loaded and lowers confidence rather than being guessed.
- Fee evidence is available for 857 course records through current course/CRICOS evidence paths, while missing fees receive reduced influence rather than a positive affordability assumption.
- Regional campus data currently contains 124 regional campuses and all 124 are marked with verified regional status in the current dataset.
- Error, empty and retry states are implemented for recommendation loading and database selectors.
- Course comparison supports up to 3 selected recommendations.
- Detailed assessment remains separate from the base Quick Match score and uses transparent small adjustments.
- Migration-aware ranking remains separate from the original result and does not claim PR, visa, invitation or skills-assessment eligibility.

## Acceptance issues found and corrected

### 1. Affordability consistency

The recommendation shortlist scorer previously derived annual tuition as `totalFee / 2` when only total tuition was available. That assumed a two-year duration and could disagree with the visible Budget Assessment panel.

The scorer now uses course duration:

- Semester tuition prefers `totalFee * (6 / durationMonths)`.
- If total tuition is unavailable, semester tuition uses `annualFee / 2`.
- Full-course tuition prefers the direct total tuition value.
- If direct total tuition is unavailable, full-course tuition is derived from `annualFee * durationMonths / 12`.
- If neither comparison can be made, affordability is kept limited/neutral rather than treated as a strong positive signal.

The audit also found 90 current international fee rows where direct total tuition differs by more than AUD 100 from `annualFee * duration / 12`, confirming that the visible and ranking logic should prefer the same duration-aware/direct-total semantics instead of assuming annual and total values are interchangeable.

### 2. Living-cost source evidence

The recommendation API previously returned the living-cost amount and verification status but omitted `source_url` and `verified_at`. As a result, the client could never classify a loaded living-cost row as source-backed.

The API now returns source URL and verification date for living-cost records, and Quick Match passes those fields into the location assessment. Missing living-cost data is still shown as not loaded rather than invented.

### 3. Progress accessibility

The four-step Quick Match progress indicator now exposes `role="progressbar"`, current step, minimum/maximum values and an accessible label.

## Manual local acceptance still required

Because this branch is intentionally not deployed and the connected environment cannot drive the user's local browser, the final visual/interaction pass must be done locally after pulling the branch. Test at least:

1. Software Engineer — broad IT background, metro preference.
2. Registered Nurse — confirm non-nursing health courses do not receive strong career ranking.
3. Teacher — confirm teaching/education courses dominate career relevance.
4. Psychologist — confirm non-psychology behavioural/health courses are capped when profession-specific terms are absent.
5. Lawyer — confirm law/legal/Juris Doctor study dominates career relevance.
6. Low vs high semester/full-course budgets — confirm Budget score and Budget Assessment panel move consistently.
7. Regional yes vs no — confirm verified regional campuses receive the intended bonus/penalty behaviour.
8. A result without entry requirements — confirm `Requirements not loaded` / low-confidence wording.
9. Select 2–3 courses — confirm comparison table opens and remains horizontally scrollable on mobile.
10. Edit answers and recalculate — confirm current answers persist until recalculation.
11. Detailed assessment — confirm funds/experience/skills/dependants only make modest transparent adjustments.
12. Recommendation API failure/no-result state — confirm Retry and Edit/Broaden actions remain usable.
13. Keyboard-only selector use — Arrow keys, Enter and Escape.
14. Phone-width layout — no clipped cards/buttons and comparison remains scrollable.

Do not merge PR #44 until this local browser pass is completed and the latest CI run is green.
