# Repository Guidelines

## Project Structure & Module Organization
Source code lives in `src/`, with React entry points in `src/main.tsx` and UI logic in `src/App.tsx`. Shared utilities such as IndexedDB helpers and calculation logic sit alongside the app in files like `src/save.ts` and `src/calc.ts`. Unit and integration tests follow the `*.test.ts` pattern in `src/__tests__/`. Static assets (favicon, manifest, copy deck) belong in `public/`, while ready-to-deploy output lands in `dist/` after a build. Data snapshots used to seed the UI are stored in `data/`. Deployment is tuned via `netlify.toml`, and core tooling is configured through `vite.config.ts` and `tsconfig.json`.

## Build, Test, and Development Commands
- `npm run dev` – Launches the Vite dev server with hot module replacement at `http://localhost:5173`.
- `npm run build` – Produces an optimized production bundle in `dist/`.
- `npm run preview` – Serves the build output locally to verify production behaviour.
- `npm test` – Executes the Vitest suite once with the basic reporter.
- `npm run test:watch` – Runs Vitest in watch mode for tight feedback while iterating.

## Coding Style & Naming Conventions
Use TypeScript with ES modules and keep components in PascalCase (e.g., `HouseholdChart`). Hook helpers and utility functions should be camelCase (`useIndexedDb`, `formatSeries`). Indent with two spaces to match existing files, and prefer descriptive const names over abbreviations. Align imports at the top of modules and group React, third-party, then local paths. Run an editor-integrated formatter (Prettier or equivalent) to maintain consistent spacing and quote styles.

## Testing Guidelines
Vitest powers the current suite; new tests should live alongside peers in `src/__tests__/` and follow the `featureName.test.ts` naming convention. Strive to cover both data transforms (e.g., savings calculations) and UI-driven workflows that rely on IndexedDB state. When adding async tests, await IDB setup helpers to avoid flakiness. If end-to-end coverage is introduced later, keep those specs in a dedicated `e2e/` folder to avoid mixing layers.

## Commit & Pull Request Guidelines
The workspace does not expose prior Git history; default to Conventional Commit style (`feat: add expense import flow`) so changelogs remain clear. Scope commits narrowly—one functional change per commit with tests bundled. Pull requests should include: a concise description of the change set, any related issue or Netlify deploy link, screenshots or GIFs for UI updates, and notes on test coverage. Flag migration or data-impacting changes explicitly so reviewers can focus on downstream effects.
