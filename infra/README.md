# Infrastructure (Terraform skeleton — M0-T1)

All persistence, backups and logs must live in-country (REG-007/051), so every
environment pins **AWS me-central-1 (UAE)**. This is a skeleton: modules declare
shape only; no resources are applied yet.

- `envs/dev/`, `envs/uat/` — environment root modules (`prod` is added at M5 and
  refuses to start with `PLACEHOLDER_` config, per CLAUDE.md §2).
- `modules/network`, `modules/database`, `modules/app` — filled in as milestones
  need them.

State backend values are `PLACEHOLDER_` until the project AWS account exists
(tracked in PROGRESS.md "Blocked"). Until then run with `terraform init -backend=false`
for validation only.
