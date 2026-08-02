# Frontend guidance

These rules apply to the Svelte and TypeScript code under `src/`.

## Implementation rules

- Use Svelte 5 runes only in new or changed Svelte code (`$state`, `$derived`, `$effect`, and related runes). Do not introduce legacy reactive patterns.
- Keep TypeScript strict and use no `any`. Prefer explicit domain types and `unknown` with narrowing at error or boundary points.
- Put business logic in Svelte stores or pure TypeScript modules. Keep components focused and generally below 300 lines.
- Direct Tauri `invoke()` calls remain restricted to `src/lib/api.ts`. Components and other frontend modules use its typed wrappers rather than calling the IPC layer directly.
- Wrap Tauri JavaScript plugin APIs in dedicated adapter modules instead of importing plugin APIs throughout UI components. Keep native integration behind a small, testable boundary.
- Treat network-returned text as untrusted data. Never inject it as raw HTML; use the existing safe rendering path and destination validation.
- New logic must be unit-testable without live network access. Use deterministic fixtures, dependency injection, or mocked adapters for external boundaries.
- Reuse the existing toast, modal, styling, focus-management, keyboard, and accessibility patterns when adding UI. Preserve current theme variables and semantics.

## Validation

For frontend behavior changes, run the narrowest useful Vitest tests while iterating, then the applicable complete checks from the repository gate, including `pnpm format:check`, `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm audit:theme`, and `pnpm build` as appropriate.
