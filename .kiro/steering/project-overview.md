---
inclusion: always
---

# Project: wisper-lib

## Status
Planning and documentation. No application code, installed dependencies, live deployment, or AWS integration exists yet.

## Product

A personal book library, reader, and tracker in a candlelit, Kiro-themed setting. Unread books can whisper through Amazon Polly. Readers can add personal books, track progress, highlight passages, and keep searchable notes.

The agreed platform order is website first, then phone app. Support both phone AR notes and a VR library, with AR before VR. Location-linked notes, camera anchors, and VR placements refer to the same note content but use separate location records.

Start with DRM-free EPUB and manual entries for physical books. PDF support follows. Sound, camera, and location are optional; ordinary reading and notes remain available without them. Books and notes are private by default.

## Stack direction

The owner chose Perl for the backend and prefers mature technology refined for modern use, with AWS services where useful. Proposed baseline: maintained Perl 5, Mojolicious, server-rendered HTML/CSS, focused JavaScript or TypeScript browser modules, Amazon RDS for PostgreSQL through Mojo::Pg/DBD::Pg for hosted data, local PostgreSQL for development, and a Minion worker when slow jobs are introduced. This supersedes the earlier Next.js backend proposal. No dependencies are installed yet.

The selected AWS architecture uses RDS for PostgreSQL as the primary hosted database, S3 for private files, Polly for whispers, Cognito for login, ECS/Fargate and ECR for container hosting, Secrets Manager for credentials, and CloudWatch for operations. Services remain unprovisioned; region, resource sizing, availability, backups, and cost require checks before deployment. Paws is a community SDK and needs an S3/Polly and temporary-credential prototype. Textract capture and Bedrock-assisted recall are optional later experiments. A note constellation starts with explicit links between notes.

Amazon's early bookstore is inspiration. Do not claim Perl powered its original storefront without a verified primary source, or imply Amazon affiliation. Keep the backend in Perl unless the owner changes that direction; clients share API contracts rather than Perl domain modules.

## Product documents

- `README.md` — public project introduction and current status.
- `docs/product-plan.md` — scope, release order, completion criteria, and open decisions.
- `docs/architecture.md` — proposed implementation and service boundaries.
- `docs/design-guide.md` — theme, screen behavior, and accessibility.

Perl and the AWS service direction above are the implementation plan following the owner's request. Specific modules, versions, region, resource sizes, and deployment configuration remain to be validated. No configured service or completed integration is claimed. Do not describe planned features, integrations, or Kiro workflows as completed work.

## Hackathon

The event details below are the supplied planning baseline. Refresh the official rules before a compliance audit or submission.
- **Event:** Kiroween 2026 on Devpost
- **Submission Period:** Oct 30, 2026 9:00 am PT → Dec 4, 2026 2:00 pm PT
- **Rules page:** https://kiroween.devpost.com/rules
- **Category:** TBD — must be one of: Resurrection, Frankenstein, Skeleton Crew, Costume Contest

## Key constraints (always enforce)
- Built with Kiro (IDE/CLI/Web/Crew) — insufficient use = disqualification
- Code created after Oct 30, 2026 (frameworks/libraries/templates OK; pre-existing code must be disclosed)
- Public GitHub repo only (not GitLab or Bitbucket)
- `/.kiro` directory tracked in git — NEVER add to .gitignore
- Open-source license file at repo root (GitHub must detect it)
- No secrets, credentials, or private data in the repo

## Kiro configuration and evidence

| Item | Current evidence |
| --- | --- |
| Custom agent | `.kiro/agents/kiroween-guardian.md` is configured for project readiness and submission audits. Actual Kiro invocation is not evidenced. |
| Steering | `project-overview.md` and `kiro-rules.md` describe the product and working rules. |
| Hooks | Three configured JSON hooks cover credential patterns, Kiro ignore checks, and new-file review. Command hooks require Git and Python 3. Actual event execution in Kiro must be checked separately. |
| Specs | Not created yet; no spec-driven implementation is claimed. |
| MCP | `.kiro/settings/mcp.json` contains an empty server map; no service integration is configured. |
| Kiro surfaces, powers, and property-based tests | Not evidenced in the repository. Record actual usage when it occurs. |

The agent and hooks follow the current [Kiro agent reference](https://kiro.dev/docs/custom-agents/configuration-reference/) and [hook format](https://kiro.dev/docs/hooks/). Static checks do not establish that Kiro loaded or ran them.

## Dependencies
> Add every third-party dependency here with its SPDX license identifier as you add it.
> Example: `react@18.3.1 — MIT`

_(none yet)_
