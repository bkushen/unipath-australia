# UniPath Australia — Product Requirements V2

## 1. Purpose
UniPath Australia is an international-student decision platform for Australia. It must help a student choose a course, university, campus, suburb/state and career direction by combining verified education data, affordability, travel, labour-market information and migration-pathway information.

The platform must never state that a course guarantees permanent residency. It presents current pathway information, evidence, assumptions and dates.

## 2. Delivery strategy
### Stage A — Local-first development
- Run entirely on the developer machine.
- Use deterministic dummy data and local fixtures.
- No production deployment is required for feature acceptance.
- External providers are represented through adapters with mock implementations.
- All calculations must be testable without internet access.

### Stage B — Verified real-data integration
- Replace fixtures with source-dated Australian data.
- Store source URL, publisher, retrieved date, effective date and verification status.
- Add ingestion jobs, validation, reconciliation and admin review.

### Stage C — Production
- Supabase/PostgreSQL production data.
- Authentication, RLS, observability, CI/CD, security hardening and deployment.

## 3. Core user outcomes
A student should be able to answer:
1. Which courses am I academically suited for?
2. Which professions align with my education, skills and career goals?
3. Which universities and campuses offer those courses?
4. Which state provides the strongest combined fit for career demand, affordability, location preference and current migration-pathway options?
5. What will the full course/living cost be and how much money will I have left?
6. If I live in a selected suburb, how long will it take to reach campus by car and public transport, and what is the simplest practical route?
7. What evidence and updated sources support every recommendation?

## 4. Required assessment and result flow
UniPath must support two assessment depths, but they are connected rather than separate dead-end journeys.

### 4.1 Quick Match flow
1. User completes the minimum Quick Match inputs.
2. UniPath generates the Quick Result.
3. On the Quick Result screen, UniPath asks: **“Would you like a more detailed and accurate recommendation?”**
4. If **Yes**, preserve all Quick Match answers and open the Detailed Assessment with those fields pre-filled. The user must never need to start again.
5. If **No**, keep the Quick Result available.
6. Whether the user chooses Detailed Assessment or not, the Quick Result screen must also ask: **“Would you like UniPath to consider potential PR / migration pathways after your course?”**
7. If the user selects migration-aware analysis, re-run the recommendation engine using the same Quick Match profile plus migration preferences and show a separate migration-aware result.

### 4.2 Detailed Assessment flow
1. User completes the Detailed Assessment directly, or upgrades from Quick Match.
2. UniPath generates the Detailed Result.
3. After the Detailed Result is shown, UniPath asks: **“Would you like UniPath to consider potential PR / migration pathways after your course?”**
4. If **Yes**, collect the required migration preferences and what the user permits UniPath to change (course, profession, university, campus, state, regional location, budget tolerance, duration).
5. Re-run the full recommendation engine and display a separate Detailed Migration-Aware Result.
6. Show the original Detailed Result and Migration-Aware Result side by side or with a clear comparison explaining what changed and why.

### 4.3 Universal result rule
**Every primary recommendation result must offer migration-pathway analysis after the result is shown.**

This includes:
- Quick Result → ask Detailed? → ask PR / migration pathways.
- Detailed Result → ask PR / migration pathways.
- Any future AI-generated saved recommendation → offer PR / migration analysis if it has not already been performed.

Migration analysis is therefore an optional second optimisation layer, not a mandatory input before the student can see an education/career recommendation.

### 4.4 Preferred user journey
`Quick Match → Quick Result → [Upgrade to Detailed?] → [PR/Migration Analysis?]`

If upgraded:
`Quick Result → Detailed Assessment (pre-filled) → Detailed Result → [PR/Migration Analysis?] → Detailed Migration-Aware Result`

If not upgraded but migration is requested:
`Quick Result → Migration Preferences → Quick Migration-Aware Result`

If user starts detailed directly:
`Detailed Assessment → Detailed Result → Migration Preferences → Detailed Migration-Aware Result`

### 4.5 Result separation
The UI must never silently replace the original result. Keep both versions so the student can compare:
- **Original recommendation** — primarily education, career, affordability, location and job-market fit.
- **Migration-aware recommendation** — re-optimised using current migration-pathway alignment within user-approved constraints.

The UI must clearly explain any changes to profession, course, university, campus, state, regional status, cost, commute, career score and migration alignment.

## 5. CV-assisted recommendation
### Inputs
- CV upload: PDF/DOCX.
- Previous qualifications.
- Study discipline.
- Work history and years of experience.
- Technical/professional skills.
- Certifications.
- Current profession.
- Desired profession.
- Salary ambition.
- Preferred states/suburbs.
- Regional preference.
- Tuition budget.
- Total available funds.
- Intended intake.
- English test information.
- Family composition.
- Migration goals.

### Processing
1. Parse CV into a structured candidate profile.
2. Show extracted fields to the user for correction before recommendations.
3. Map qualifications/experience/skills to occupation families.
4. Find eligible or plausible courses based on academic prerequisites.
5. Score course + university + campus + state combinations.
6. Return transparent score components and reasons.

### Recommendation output
For each recommended option show:
- Overall match score.
- Academic fit.
- Career fit.
- Skills-gap fit.
- Tuition affordability.
- Total affordability.
- Location fit.
- Commute fit.
- Labour-market fit.
- Migration-pathway alignment when migration analysis has been requested.
- Evidence confidence.
- Risks/cautions.
- Missing information.

## 6. State recommendation engine
State scoring must use separate, explainable dimensions rather than a single hidden AI judgment.

Suggested dimensions:
- occupation demand / employment outlook
- graduate job opportunities
- salary/earnings indicators
- number of relevant course options
- tuition affordability
- living-cost affordability
- regional/metropolitan preference
- migration-pathway relevance under current rules when migration analysis is enabled
- commute/accessibility for selected suburb/campus
- user preference

Every score must retain the source version used to calculate it.

## 7. Money / affordability engine
The application must show a detailed money calculation after a course/university is selected.

### Required cost components
- annual tuition
- tuition over full duration
- expected annual fee increase (explicit assumption)
- scholarship/discount
- application fee where applicable
- deposit / first payment
- OSHC estimate
- visa-related cost fields
- flights/travel setup estimate
- rent
- utilities
- groceries
- local transport
- phone/internet
- study materials/equipment
- personal expenses
- emergency buffer
- family/dependant costs when applicable

### Required outputs
- first-year education cost
- first-year living cost
- first-year total
- full-course estimated total
- monthly living requirement
- weekly living requirement
- funds available
- remaining money after first year
- remaining money after full estimated study period
- shortfall, if any
- percentage of budget consumed
- comparison against alternative universities

### Calculation quality rules
- Use Decimal/numeric calculations; no floating-point money arithmetic.
- Store currency and calculation date.
- Distinguish verified values from estimates.
- Every estimated value must expose its assumption.
- Calculations must be reproducible from stored inputs.

## 8. Suburb-to-campus commute engine
After selecting a suburb and campus, show:
- driving distance
- typical driving duration
- public-transport duration
- walking segments
- transfers
- route modes (train/tram/bus/ferry/walk)
- simplest route
- fastest route
- lowest-transfer route where data allows
- peak/off-peak caveat
- estimated weekly commute time
- estimated commute cost where supported

### Architecture
Use a provider interface so local development can use mock route fixtures and production can later use Google Maps/Mapbox/transit providers.

`RoutingProvider`
- `getDrivingRoute(origin, destination)`
- `getTransitRoutes(origin, destination, departureTime)`
- `getWalkingRoute(origin, destination)`

Do not hard-code a vendor into domain logic.

## 9. Source provenance and freshness
Every changeable fact should support:
- source_name
- source_url
- publisher
- source_type
- retrieved_at
- effective_from
- effective_to
- last_verified_at
- verification_status
- confidence
- raw_snapshot/reference

The UI must display "Last verified" and the source used for important claims.

## 10. Proposed bounded modules
- identity/authentication
- student profile
- CV/document analysis
- universities
- campuses
- courses
- course taxonomy
- admissions/entry requirements
- fees/scholarships
- affordability
- suburbs/location
- commute/routing
- occupations/careers
- labour market
- migration pathways
- recommendation engine
- comparison
- shortlist/saved items
- source provenance
- admin/data verification
- audit/observability

## 11. Local dummy-data scope
Initial local fixtures should include at least:
- 5 universities
- 8 campuses across VIC, NSW, QLD and SA
- 20 courses across IT, Engineering, Business and Health
- 10 occupations
- 12 suburbs
- tuition histories
- scholarships
- living-cost fixtures
- commute fixtures
- labour-market fixtures
- migration-pathway fixtures explicitly labelled SAMPLE/DEMO
- 3 sample CV profiles

Dummy records must be visibly marked as demo data so they cannot be confused with current Australian facts.

## 12. Software engineering standards
### Code
- TypeScript strict mode.
- Small cohesive modules.
- Domain/business logic separated from UI and infrastructure.
- Adapter pattern for external APIs.
- Validation at system boundaries.
- No secrets committed.
- Central error handling.
- Structured logging.

### Quality
- ESLint + formatting.
- Unit tests for all scoring/calculation logic.
- Integration tests for repositories/services.
- End-to-end tests for critical student journeys.
- Accessibility checks.
- Security dependency scanning.
- CI gates: typecheck, lint, test, build.

### Data
- PostgreSQL constraints, indexes and foreign keys.
- Migrations committed to source control.
- Seed script for deterministic local data.
- RLS for production user-owned data.
- Audit history for high-impact data changes.

### Security/privacy
- CV files treated as sensitive personal data.
- Minimise retention.
- Separate extracted profile data from raw documents.
- Signed/private document access in production.
- Upload size/type validation and malware scanning hook.
- Never send CV content to an AI provider without explicit product-level disclosure/consent and configured privacy controls.

## 13. Recommendation safety rules
- AI must not invent fees, university facts, job-market statistics or migration rules.
- Structured database facts are authoritative for application output.
- AI may explain, summarise or map user language to structured filters.
- A recommendation must be traceable to score components.
- Migration content must be presented as informational pathway analysis, not a guarantee or personalised legal advice.

## 14. Acceptance criteria for local milestone
The local milestone is complete when a developer can run the project locally and:
1. Load deterministic dummy data.
2. Complete Quick Match and receive a Quick Result.
3. From Quick Result, choose to upgrade to Detailed Assessment without re-entering existing answers.
4. From Quick Result, optionally request migration-aware analysis and receive a distinct Quick Migration-Aware Result.
5. Complete Detailed Assessment directly or from Quick Match and receive a Detailed Result.
6. From Detailed Result, optionally request migration-aware analysis and receive a distinct Detailed Migration-Aware Result.
7. Compare original and migration-aware results and see what changed and why.
8. Upload or select a sample CV.
9. Review/edit the extracted profile.
10. Receive ranked profession/course/university/state recommendations.
11. Select a university/course and see a full money calculation.
12. Select a suburb and see mock driving/transit route comparison.
13. Compare at least three course options.
14. See the reason behind every score.
15. See source/assumption labels on all changeable facts.
16. Run typecheck, lint, unit tests, integration tests and production build successfully.

## 15. Production data candidates
When Stage B begins, prefer authoritative/primary sources for:
- CRICOS/provider/course records
- university official course/fee pages
- Study Australia
- Jobs and Skills Australia
- Department of Home Affairs
- state/territory migration programs
- official transport/routing providers
- official/statistical living-cost sources where available

All production-source connectors require source-specific validation and change monitoring.