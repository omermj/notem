## Summary

Describe the problem and the resulting behavior. Link the related issue where applicable.

## Risk and design

Describe filesystem, data-loss, security, privacy, migration, licensing, or cross-platform implications. Write “None” when an area is not affected.

## Validation

List the commands and manual scenarios you ran, including operating systems tested.

- [ ] `pnpm format:check`
- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm audit:theme`
- [ ] `pnpm build`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`

## Visual changes

Add before/after screenshots made with a synthetic vault, or write “Not applicable.”

## Contributor checklist

- [ ] I added or updated regression tests for changed behavior.
- [ ] I updated user, contributor, security, privacy, or architecture documentation where needed.
- [ ] I did not include generated build output, local settings, real vault content, credentials, personal information, or proprietary material.
- [ ] I identified third-party or generated assets/code and preserved compatible licenses and notices.
- [ ] I stated which target platforms I tested and did not claim unperformed validation.
- [ ] Every commit includes a Developer Certificate of Origin sign-off (`git commit -s`).
