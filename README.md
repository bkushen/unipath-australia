# UniPath Australia

A decision-support platform for international students choosing Australian university courses based on academic fit, career goals, tuition and living costs, location preferences, graduate outcomes and current potential migration pathways.

## Product principles

- Never claim a course guarantees permanent residency.
- Separate verified facts, estimates and AI-generated analysis.
- Store source URL, effective date and verification date for time-sensitive records.
- Prefer authoritative Australian Government and university sources.
- Explain recommendation scores rather than presenting unexplained percentages.
- Treat affordability as total cost of study, not tuition alone.

## Stack

- Next.js 16 + React 19 + TypeScript
- PostgreSQL / Supabase
- Supabase Auth with SSR session handling
- CRICOS government data normalisation and chunked ingestion
- GitHub Actions with locked installs, production dependency audit, typecheck and optimized build
- Vercel-ready frontend architecture

## Core modules

1. Student profile and eligibility assessment
2. University, campus and course catalogue
3. Course curriculum and accreditation comparison
4. Tuition, scholarships and total-cost calculator
5. City/region living-cost intelligence
6. Career and graduate-outcomes layer
7. Occupation and migration-pathway explorer
8. Explainable recommendation engine
9. Saved courses and side-by-side comparisons
10. Admin verification and data freshness dashboard

## Current catalogue status

- 42 Australian universities mapped to 43 current CRICOS provider registrations
- 11,908 active CRICOS university courses across 12 broad fields of education
- 256 CRICOS locations
- 17,012 source course-location rows reconciled with zero missing source mappings
- 11,908/11,908 CRICOS courses have verified duration data
- 23 courses have no location mapping in the current source snapshot and remain explicitly unavailable rather than inferred
- University-specific fee, living-cost, accreditation, career and migration evidence is stored separately from bulk CRICOS facts and is enriched only when source-verified

## Data quality note

The current CRICOS university snapshot does not provide tuition totals for the bulk university course records. UniPath therefore does not infer or fabricate fees: fee-unverified courses remain searchable but display tuition as pending, while source-verified university fee records are preferred for affordability analysis.

## Status

The production data foundation, authentication, assessment persistence, explainable recommendations, course details, comparison flow, shortlisting, CRICOS bulk catalogue pipeline, security hardening and deterministic CI are implemented. Current work is focused on expanding university-specific fee/living-cost/pathway enrichment and public deployment.
