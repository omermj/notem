# GitHub and workflow guidance

These rules apply to GitHub Actions workflows and repository automation under `.github/`.

## Trust boundaries

- Pin every third-party action to a reviewed full commit SHA and retain a version comment for maintainability.
- Keep checkout credentials disabled with `persist-credentials: false`.
- Keep build and validation jobs at `contents: read`. Only the environment-gated release job may receive `contents: write`.
- Release builds must resolve an existing annotated version tag, validate its object, and check out the exact validated tag commit SHA. Revalidate that the tag has not moved before uploading release assets.
- Never automatically publish a release. The existing release workflow creates or updates a draft only; publication requires an explicit maintainer action.
- Never replace the existing hardened release flow with a generic publishing action.
- Scope secrets and tokens to the single step that needs them whenever possible; never expose a secret at job scope when step scope is sufficient.
- Preserve installer artifact collection, `SHA256SUMS` generation, bundled legal-file verification, and Windows GUI-subsystem validation.
- Workflows that run for fork pull requests must not require repository secrets. Keep pull-request paths read-only and safe for untrusted code.

Before changing release automation, read `docs/RELEASING.md` and preserve its environment, tag, draft-release, artifact, and verification assumptions.
