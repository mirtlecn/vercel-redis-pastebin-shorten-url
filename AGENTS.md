# Post Repository Guide for Coding Agents

## Overview

- This repo contains a Node.js API server and a React admin UI.
- Main server entry: `server.js`
- Admin UI source: `web/src`
- API handlers and storage logic: `lib/handlers`, `lib/services`, `lib/utils`
- Functional smoke tests: `test/functional`

## Quick Start

### Install

```bash
npm install
```

### Local development

```bash
# Full local dev: API server + Vite dev server
npm run dev

# Production-like local server
npm start
```

Default admin URL:

```text
http://localhost:3000/admin
```

## Environment

Required variables for normal app startup:

- `LINKS_REDIS_URL`
- `SECRET_KEY`

Optional:

- `ADMIN_KEY`
- `MAX_CONTENT_SIZE_KB`
- `MAX_FILE_SIZE_MB`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`
- `S3_REGION`

For `/admin`, login uses `ADMIN_KEY` when set, otherwise `SECRET_KEY`.

## Code Map

### Backend

- `api/`: serverless-style route entrypoints
- `lib/handlers/create.js`: create / update request handling
- `lib/handlers/list.js`: authenticated list response
- `lib/handlers/authenticated-lookup.js`: authenticated item lookup
- `lib/services/topic-store.js`: topic storage and index rebuild logic
- `lib/utils/storage.js`: stored value shape, `created` normalization, compatibility helpers

### Frontend

- `web/src/components/CreatePanel.jsx`: composer UI
- `web/src/components/ListPanel.jsx`: list table
- `web/src/components/ResultPanel.jsx`: result card after create
- `web/src/hooks/useComposer.js`: composer state and submit flow
- `web/src/lib/composer-mode.js`: composer request shaping and UI state helpers
- `web/src/styles.css`: shared admin UI styling

## Test Matrix

### Default test entry

```bash
npm test
```

Runs:

- `npm run test:quick`
- `npm run test:smoke:web:local`
- `npm run test:smoke:api:local`

### Other useful test commands

```bash
# Quick unit suite only
npm run test:quick

# Unit tests only
npm run test:unit

# Both local smoke suites
npm run test:smoke:local

# Admin/web smoke suite only
npm run test:smoke:web:local

# API smoke suite only
npm run test:smoke:api:local

# Everything local
npm run test:all
```

Notes:

- `test:quick` runs only `node --test`.
- `test:smoke:local` runs both local smoke suites without re-running unit tests.
- `test:smoke:web:local` covers `/admin`, `/api/admin`, and main JSON API flows using shell assertions.
- `test:smoke:api:local` is the deeper API contract smoke suite.
- `test:smoke:web:vercel` is optional and should not be added to the default chain unless the environment is known to have `vercel dev`.

## Testing Conventions

- If you change request shaping, storage normalization, or UI helper logic, add or update unit tests in `test/*.test.js`.
- If you change externally visible HTTP behavior, add or update shell smoke coverage in `test/functional`.
- Prefer extending existing smoke scripts over creating another overlapping smoke entrypoint.
- Keep smoke assertions deterministic. Use fixed input timestamps when testing `created`.

## Editing Guidance

- Use English for code, comments, filenames, and documentation updates.
- Keep functions and files single-purpose where practical.
- When frontend behavior changes, update:
  - the relevant component or hook
  - helper tests
  - any smoke coverage that validates the same external behavior
  - README if developer-facing commands or workflows changed

## Debugging Tips

- If a create/list/delete flow looks wrong, inspect:
  - `lib/handlers/create.js`
  - `lib/handlers/list.js`
  - `lib/utils/storage.js`
- If admin UI submission looks wrong, inspect:
  - `web/src/hooks/useComposer.js`
  - `web/src/lib/composer-mode.js`
  - `web/src/components/CreatePanel.jsx`
- If smoke tests hang inside a sandboxed environment, rerun outside the sandbox before assuming the script logic is broken. This repo's local smoke scripts start nested long-lived processes (`npm start`), which can expose sandbox process-management issues.

## Git Expectations

- Use Conventional Commits.
- Commit only after the related tests pass.
- Do not revert unrelated user changes.

## Release Process

- Keep the package version in `package.json` and `package-lock.json` aligned by using:

```bash
npm run version:bump -- patch
```

- To set an explicit release version, use:

```bash
npm run version:bump -- 1.4.0
```

- For a normal release:
  - finish and test the functional change
  - commit the functional change first
  - bump the version in a separate commit
  - create an annotated git tag in the `vX.Y.Z` format after the version commit

- Release commit messages should use Conventional Commits, for example:
  - `chore(release): bump version to 1.4.0`
