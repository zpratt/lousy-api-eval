# lousy-api-eval

Evaluation framework for measuring the impact of GitHub Copilot instructions on REST API code quality across models.

Uses an automotive dealership vehicle quoting domain with two sequential tasks — a greenfield API build and an expansion task — scored via acceptance tests, a manual scorecard, and static analysis metrics. The run matrix is **(model) × (instruction variant) × (2 tasks)**.

See [`.github/specs/lousy-init-api-eval-spec.md`](.github/specs/lousy-init-api-eval-spec.md) for the full evaluation spec, task prompts, and scorecard.