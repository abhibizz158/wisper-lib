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

The owner requested a client-rendered experience and authorized changing the earlier Perl choice. Current plan: React and TypeScript, React Router framework SPA mode with Vite, TanStack Query for server state, and IndexedDB note drafts. The backend is Node.js/TypeScript with Fastify, node-postgres (`pg`), runtime-validated contracts, and official AWS SDK v3 clients. No dependencies or application code exist yet.

AWS architecture: Amplify Hosting for the static frontend; ALB HTTPS ingress and ECS/Fargate/ECR for the API and later worker; RDS PostgreSQL for records; S3 for private files; Cognito for accounts; Polly for whispers; SQS when slow jobs begin; Secrets Manager and CloudWatch for credentials and operations. Textract capture and Bedrock-assisted recall remain later experiments. Services are unprovisioned.

Optimize the full AWS request path: Amplify's built-in CloudFront cache, direct authorized S3 transfers, generated thumbnails, cached Polly output, independently bounded API/worker scaling, and indexed owner-scoped SQL. Use CloudWatch to establish the baseline. RDS Proxy, ElastiCache, and separate private-media CloudFront require a measured trigger; sampled RUM requires privacy, cost, and bundle review. No extra services are provisioned.

Client rendering is a design choice, not evidence of a speedup. Follow the architecture's code-splitting, caching, pagination, account isolation, and measured performance targets. The browser never connects directly to RDS or holds service secrets. Local drafts require explicit sync and conflict handling.

Amazon's early bookstore remains inspiration. Describe actual AWS and Kiro usage without implying affiliation or claiming Amazon's original storefront stack. Shared TypeScript contracts can support future phone clients; AR still needs a native device prototype.

## Product documents

- `README.md` — public project introduction and current status.
- `docs/product-plan.md` — scope, release order, completion criteria, and open decisions.
- `docs/architecture.md` — proposed implementation and service boundaries.
- `docs/design-guide.md` — theme, screen behavior, and accessibility.

The client-rendered TypeScript app and AWS service direction above are the current implementation plan following the owner's request. Specific modules, versions, region, resource sizes, and deployment configuration remain to be validated. No configured service or completed integration is claimed. Do not describe planned features, integrations, or Kiro workflows as completed work.

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
