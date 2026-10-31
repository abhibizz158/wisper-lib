---
inclusion: always
---

# Kiro Coding Standards & Rules for This Project

## General
- All new code goes inside this repo (Rules §4 — project must be newly created after submission period start)
- Every new dependency must be added to `/.kiro/steering/project-overview.md` with its license
- Keep `/.kiro` tracked in git at all times — never add it or its subfolders to `.gitignore`
- No secrets or credentials in any file; use environment variable names only (e.g. `OPENAI_API_KEY`, never the value)

## Code style
- Follow the language conventions of the project (to be defined when stack is chosen)
- Prefer explicit over implicit
- Every public function/module needs a short doc comment

## Security
- Never hardcode API keys, tokens, passwords, or private keys anywhere in the codebase
- Validate and sanitize all user input
- Use parameterized queries for any database access

## Accessibility
- UI components must meet WCAG 2.1 AA as a baseline
- Full validation requires manual testing with assistive technologies

## After significant changes, re-run
1. Check `.kiro` is still tracked: `git ls-files .kiro`
2. Check nothing in `.kiro` is ignored: `git check-ignore -v .kiro`
3. Scan for accidental secrets: `git grep -nE "AKIA|BEGIN.*PRIVATE KEY|ghp_|sk-"`
