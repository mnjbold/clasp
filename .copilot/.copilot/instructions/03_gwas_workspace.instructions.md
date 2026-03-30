---
name: "GWAS Workspace Rules"
description: "Apply when working in the GWAS Apps Script workspace. Use for deployment prep, module implementation, shared library changes, Google Workspace integrations, and rollout planning."
applyTo: "gwas/**"
---

# GWAS Workspace Rules

## Required Reads

Before editing or planning work in `gwas/`, read these files first:

- `spec.md`
- `gwas/README.md`
- `gwas/clasp.config.json`
- The target module's `.clasp.json`
- The target module's `appsscript.json`
- The target module's setup file in `src/`

## Deployment Rules

- Treat the shared library as the first deployment step for all module work.
- Do not replace `REPLACE_WITH_*` placeholders blindly; verify the exact script or library ID source first.
- Do not store `GEMINI_API_KEY` or other secrets in tracked files.
- Prefer Windows-safe PowerShell examples in documentation unless the user explicitly asks for POSIX shell commands.

## Safety Rules

- Assume `clasp push` replaces remote project contents and may break a live module if done out of order.
- Require a smoke test and a rollback note for any deployment plan.
- Call out manual cloud-side steps explicitly: library deployment, web app deployment, Chat app configuration, and admin-only API settings.

## Implementation Rules

- Reuse helpers from `gwas/lib/src/` instead of duplicating Workspace integration logic.
- Keep module-specific behavior inside module directories and shared behavior in the library.
- Validate manifest scopes against actual feature usage before adding more scopes.