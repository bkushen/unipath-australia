# CRICOS fee snapshots

This directory stores source-dated fee snapshots captured from official live CRICOS course-detail pages.

## Important semantics

- `tuition_fee_total` is the current CRICOS **whole-course tuition** amount. It is not an academic-year fee.
- `non_tuition_fee_total` and `estimated_total_cost` are stored separately when CRICOS publishes them.
- `source_url` must point to the matching `cricos.education.gov.au` course detail page.
- `verified_at` records when UniPath fetched the live government record.
- University-published annual fees remain separate and take precedence for annual-budget comparisons when available.
- UniPath may annualise whole-course CRICOS tuition using the registered CRICOS duration for a comparison estimate, but the UI labels that value as annualised rather than presenting it as a university annual fee.

## Validation

Run:

```bash
FEE_FILE=data/cricos/fees/<snapshot>.json node scripts/validate-cricos-fee-snapshot.mjs
```

The validator checks unique CRICOS codes, active catalogue membership, positive/consistent fee values, source-domain/code matching and verification timestamps before a snapshot is eligible for database import.
