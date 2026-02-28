# Copilot Instructions Evaluation Kit

## Overview

Two task prompts, one scorecard, and a static analysis configuration for evaluating the impact of GitHub Copilot instructions on REST API code quality across models.

**Domain:** Automotive dealership vehicle quoting system
**Run matrix:** (model) × (instruction variant) × (2 tasks)
**Evaluation method:** Acceptance tests + manual scorecard + static analysis metrics + optional LLM judge validation

---

## Static Analysis Setup

Drop this `biome.json` into each run's output repo before running analysis. All rules are set to `warn` so Biome reports every violation without bailing out early — you want total counts, not pass/fail.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "linter": {
    "rules": {
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": { "maxAllowedComplexity": 10 }
        }
      },
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsoleLog": "warn"
      },
      "style": {
        "noParameterAssign": "warn"
      }
    }
  }
}
```

### Running Analysis

```bash
npx @biomejs/biome lint .
```

### What Each Rule Catches

| Rule                             | Why it matters for this eval                                                                 |
|----------------------------------|----------------------------------------------------------------------------------------------|
| `noExcessiveCognitiveComplexity` | Did the model dump all pricing/rule logic into one mega-function, or decompose it?            |
| `noExplicitAny`                  | Type safety escape hatches — high counts mean the model punted on modeling complex types      |
| `noUnusedVariables`              | Scaffolded code that was never wired up — common in LLM expansion tasks                      |
| `noUnusedImports`                | Imported a library then never used it — signals incoherent planning                          |
| `noConsoleLog`                   | Debug statements left behind instead of proper logging — differentiates instruction-following |
| `noParameterAssign`              | Mutating function params (e.g., `req.body`) — indicates poor data flow thinking              |

### Metrics to Record Per Run

| Metric              | How to get it                                              |
|---------------------|------------------------------------------------------------|
| `any_count`         | Count of `noExplicitAny` warnings                          |
| `unused_vars`       | Count of `noUnusedVariables` warnings                      |
| `unused_imports`    | Count of `noUnusedImports` warnings                        |
| `console_logs`      | Count of `noConsoleLog` warnings                           |
| `param_assigns`     | Count of `noParameterAssign` warnings                      |
| `max_complexity`    | Highest cognitive complexity score reported                 |
| `functions_over_10` | Count of functions exceeding complexity threshold           |

Threshold of 10 (not the default 15) is intentional — it surfaces more functions in the output, giving a richer comparison across runs.

---

## Task A — Greenfield: Vehicle Quoting API

Use this prompt verbatim (or near-verbatim) for each run. Paste it as the initial prompt to Codex / Copilot.

### Prompt

```
Build a REST API for an automotive dealership vehicle quoting system. The system allows sales staff to configure and price vehicle quotes for customers.

Core entities:
- Vehicle Models: base vehicles (sedans, trucks, SUVs) with a trim level and base MSRP
- Option Categories: groupings like "Powertrain", "Safety & Driver Assist", "Interior", "Exterior", "Technology", "Towing & Hauling"
- Option: individual add-ons that belong to a category, each with its own price
- Quotes: a configured vehicle selection with a calculated price for a specific customer

Business rules (these are critical — do not skip or simplify):
1. Option compatibility: Options have dependency and exclusion relationships.
   - Some options REQUIRE another option (e.g., "Adaptive Cruise Control" requires "Forward Collision Alert")
   - Some options EXCLUDE another option (e.g., "Standard Audio" excludes "Premium Audio System")
   - Some options are RESTRICTED BY TRIM — certain options are only available on specific trim levels (e.g., "Performance Exhaust" is only available on Sport and above trims)
   - These relationships must be enforced when adding options to a quote
2. Pricing calculation:
   - Base price = vehicle model MSRP for the selected trim
   - Options are additive to the base price
   - Some options have percentage-based pricing (e.g., 2% of base MSRP) rather than flat dollar amounts
   - A "package" can bundle multiple options at a discounted combined price, but only if ALL options in the package are selected
   - Destination charge is a flat fee added to every quote, configured per model
3. Quote status lifecycle: draft → presented → accepted → expired
   - Only draft quotes can be modified
   - Presented quotes can be accepted or expire after a configurable window
   - Accepted quotes cannot be modified or reverted

Required endpoints:
- CRUD for vehicle models (with trims), options, and option categories
- Create and retrieve quotes
- Add/remove options from a quote (with compatibility validation)
- Calculate/recalculate quote pricing
- Transition quote status

Required routes (use these exact paths):
- POST /vehicles, GET /vehicles, GET /vehicles/:id
- POST /vehicles/:vehicleId/trims, GET /vehicles/:vehicleId/trims
- POST /options, GET /options, GET /options/:id
- POST /option-categories, GET /option-categories
- POST /quotes, GET /quotes, GET /quotes/:id
- POST /quotes/:id/options, DELETE /quotes/:id/options/:optionId
- POST /quotes/:id/calculate
- POST /quotes/:id/transition

Seed the application with realistic sample data for at least 2 vehicle models (e.g., a midsize sedan and a full-size truck), each with 3 trim levels and 10+ options across categories. Include at least 3 dependency rules, 2 exclusion rules, and 2 trim restriction rules.

Use TypeScript with Express. Include error handling that returns meaningful messages when compatibility rules are violated.
```

### What you're looking for (don't share this with the model)

- Is option compatibility modeled as data (a table/config of relationships) or hardcoded in if-statements?
- Does the compatibility check actually prevent invalid configurations, or does it just warn?
- Are dependency chains handled transitively? (If C requires B and B requires A, adding C without A should fail)
- Are trim-level restrictions enforced? Can you add a Sport-only option to a base trim vehicle?
- Does percentage-based option pricing actually reference the base MSRP dynamically, or is it pre-calculated and stored as a flat value?
- Does the package discount logic correctly detect when all package members are present?
- Is the destination charge included correctly in the total without being treated as an option?
- Is the quote status lifecycle enforced at the API level (can't add options to a non-draft quote)?
- Is the seed data realistic and internally consistent (no options that both require and exclude each other, trim restrictions make sense)?

---

## Task B — Expansion: Manufacturer Incentive Programs

Use this prompt for each run. The starting point is whatever the model produced for Task A — apply this prompt to that codebase.

### Prompt

```
Extend the existing vehicle quoting API with manufacturer incentive programs. These are OEM-sponsored programs that modify quote pricing based on eligibility rules.

New entities:
- Incentive Programs: named programs with an effective date range (start/end)
- Program Rules: conditions that determine if a quote qualifies for the program
- Program Benefits: the discount or modifier applied when a quote qualifies

Business rules:
1. Program eligibility evaluation:
   - Each program has one or more rules that must ALL be satisfied (AND logic)
   - Rule types include:
     - Vehicle model is in a specified list (e.g., "applies to Silverado and Tahoe only")
     - Trim level is at or above a minimum (e.g., "LT trim or higher")
     - Quote total exceeds a minimum threshold (e.g., "quote must be over $45,000")
     - A specific option or option category is included in the quote
     - Quote is created within the program's effective date range
   - Eligibility must be re-evaluated whenever the quote changes (options added/removed)

2. Benefit types:
   - Flat dollar discount off the total (e.g., "$2,000 cash back")
   - Percentage discount off the base MSRP (not the total)
   - Percentage discount off options in a specific category (e.g., "25% off Technology options")

3. Program stacking rules:
   - By default, programs DO stack (multiple programs can apply to the same quote)
   - Some programs are marked "exclusive" — if an exclusive program applies, no other programs can apply to the same quote
   - When multiple exclusive programs qualify, the one producing the largest dollar discount wins
   - Non-exclusive programs stack additively, but total program discounts cannot exceed a configurable cap (e.g., 15% of total quote value)

4. Pricing transparency:
   - The quote pricing response must include a breakdown showing:
     - Base MSRP (for selected trim)
     - Itemized options with individual prices
     - Package discounts (if any)
     - Destination charge
     - Subtotal before incentives
     - Each applied incentive program with its discount amount and name
     - Final price
   - There must be an endpoint to check program eligibility for a quote WITHOUT applying the programs (a "what-if" evaluation)

Required endpoints (use these exact paths):
- POST /incentive-programs, GET /incentive-programs, GET /incentive-programs/:id
- POST /incentive-programs/:id/rules
- POST /incentive-programs/:id/benefits
- POST /quotes/:id/evaluate-incentives
- POST /quotes/:id/apply-incentives
- GET /quotes/:id/pricing-breakdown

Seed the application with at least 3 incentive programs: one exclusive, two non-exclusive, with overlapping eligibility so stacking logic is exercised.

Maintain the existing code patterns and architecture. Do not restructure or rewrite existing functionality.
```

### What you're looking for (don't share this with the model)

**Rule engine quality:**
- Are program rules evaluated dynamically against quote state, or are they hardcoded per-program?
- Is the rule evaluation composable (can new rule types be added without rewriting the evaluator)?
- Is the "trim at or above" rule handled correctly (requires understanding trim ordering, not just equality)?
- Does re-evaluation actually trigger when options change, or is it a manual step the caller has to remember?

**Stacking logic correctness:**
- Does exclusive program detection actually work when multiple exclusive programs qualify?
- Is the "largest discount wins" comparison calculated correctly (comparing actual dollar impact, not just percentages)?
- Does the non-exclusive stacking cap enforce correctly against the final total?
- Does the cap calculation account for the full quote total (base + options + destination) or just part of it?

**Integration with existing code:**
- Did the model preserve the existing architecture, or did it restructure Task A's code?
- Does the pricing calculation now incorporate programs without breaking the original option/package/destination pricing logic?
- Is the quote status lifecycle still enforced (can't apply programs to a non-draft quote)?

**Pricing breakdown:**
- Is the breakdown fully itemized (base, options, packages, destination, each program)?
- Does the what-if endpoint return useful information (which programs qualify, what the discount would be) without mutating state?

---

## Evaluation Scorecard

Score each run on the following items. Use a simple scale:

- **0** = Missing or fundamentally broken
- **1** = Present but flawed (partially works, poor design, or brittle)
- **2** = Solid (correct, reasonably well-designed)

### Task A Scorecard (22 points max)

| #  | Dimension                        | Question                                                                                         | Score |
|----|----------------------------------|--------------------------------------------------------------------------------------------------|-------|
| A1 | Compatibility as data            | Are option dependencies/exclusions modeled as data (config, table, map) rather than hardcoded?    |       |
| A2 | Compatibility enforcement        | Does the API actually reject invalid configurations (not just warn)?                             |       |
| A3 | Transitive dependencies          | Are dependency chains followed (C→B→A all resolved or validated)?                                |       |
| A4 | Trim restrictions                | Are trim-level option restrictions enforced correctly?                                           |       |
| A5 | Percentage pricing               | Are percentage-based option prices calculated dynamically from MSRP?                             |       |
| A6 | Package detection                | Does package pricing correctly activate only when all member options are present?                 |       |
| A7 | Destination charge               | Is destination charge handled as a separate line item, not an option?                            |       |
| A8 | Status lifecycle                 | Is the draft→presented→accepted→expired lifecycle enforced at the API layer?                     |       |
| A9 | Seed data quality                | Is seed data realistic, internally consistent, and does it cover the required rules?             |       |
| A10| Error messages                   | Do compatibility violations return specific, useful error messages (not generic 400s)?           |       |
| A11| Separation of concerns           | Is business logic (pricing, rules) separated from route handling?                                |       |

### Task B Scorecard (22 points max)

| #  | Dimension                        | Question                                                                                         | Score |
|----|----------------------------------|--------------------------------------------------------------------------------------------------|-------|
| B1 | Rule engine design               | Are program rules evaluated dynamically (data-driven), not hardcoded per-program?                |       |
| B2 | Rule composability               | Could a new rule type be added without rewriting the evaluator?                                  |       |
| B3 | Trim ordering logic              | Does the "trim at or above" rule handle trim hierarchy correctly?                                |       |
| B4 | Re-evaluation on change          | Does eligibility re-evaluate when quote options change?                                          |       |
| B5 | Exclusive stacking               | Does exclusive program logic correctly pick the best single program by dollar impact?            |       |
| B6 | Stacking cap                     | Does the non-exclusive discount cap enforce correctly against the full total?                    |       |
| B7 | Pricing breakdown                | Is the response fully itemized (base, options, packages, destination, per-program discounts)?    |       |
| B8 | What-if endpoint                 | Does the simulation endpoint return useful detail without mutating state?                        |       |
| B9 | Existing code preserved          | Did the model maintain Task A's architecture and patterns?                                       |       |
| B10| Integration correctness          | Does pricing still work correctly for options/packages/destination with programs layered on?     |       |
| B11| Instruction compliance           | Did the code follow structural/architectural instructions? (N/A if no instructions given)        |       |

### Static Analysis Metrics (record per run)

| Metric              | Value |
|---------------------|-------|
| `any_count`         |       |
| `unused_vars`       |       |
| `unused_imports`    |       |
| `console_logs`      |       |
| `param_assigns`     |       |
| `max_complexity`    |       |
| `functions_over_10` |       |

### Recording Results

Track everything in a single spreadsheet. One row per run:

| Run | Model     | Instructions | Task | A1 | A2 | ... | A11 | Scorecard Total | any_count | unused_vars | unused_imports | console_logs | param_assigns | max_complexity | funcs_over_10 | Notes           |
|-----|-----------|-------------|------|----|----| --- |-----|-----------------|-----------|-------------|----------------|--------------|---------------|----------------|---------------|-----------------|
| 1   | codex-5.2 | none        | A    | 1  | 2  |     |     | 14              | 12        | 3           | 1              | 8            | 2             | 35             | 4             | Hardcoded rules |
| 2   | codex-5.2 | v1          | A    | 2  | 2  |     |     | 19              | 3         | 0           | 0              | 0            | 0             | 12             | 1             | Much better     |
| 3   | codex-5.2 | none        | B    | 0  | 0  |     |     | 10              | 18        | 5           | 3              | 12           | 4             | 42             | 6             | Rewrote Task A  |

### Interpreting Results

**Scorecard signals:**
- **Instructions impact** = Compare "none" vs "v1" for the same model and task. Consistent improvement across items = instructions are working.
- **Model comparison** = Compare models with the same instruction set. Shows which model is most responsive to guidance.
- **Expansion quality** = B9 and B10 are the key items. If these score low, the model is not good at extending existing code regardless of instructions.
- **Instruction refinement signal** = Look at which items score low even WITH instructions. That tells you what your instructions need to be more explicit about in the next iteration.

**Static analysis signals:**
- **`any_count`** should drop significantly with good instructions. If it doesn't, your instructions need explicit type safety guidance.
- **`max_complexity` + `functions_over_10`** together reveal structure. High max + low count = one monolithic function. Moderate max + high count = complexity spread everywhere. Both are problems, but different ones.
- **`console_logs`** is a direct instruction-following test if your instructions specify a logging pattern. A model that ignores your logging guidance will show it here.
- **`unused_vars` + `unused_imports`** spike in Task B when the model scaffolds code it never connects. This correlates with B9 (existing code preserved) — a model that rewrites aggressively tends to leave more dead code behind.
- **`param_assigns`** correlates with separation of concerns (A11). Models that mutate params are usually mixing business logic into route handlers.

**Cross-referencing:** Static analysis confirms or challenges your scorecard. If you gave A11 (separation of concerns) a "2" but `max_complexity` is 30 and `param_assigns` is 5, revisit your score — the numbers are telling a different story than your impression.
