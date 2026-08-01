# Security policy

## Supported versions

NoteM is pre-1.0. Security fixes are provided for the latest public minor release only.

| Version                               | Supported |
| ------------------------------------- | --------- |
| Latest `0.2.x` release                | Yes       |
| Older releases and development builds | No        |

Until `v0.2.1` is published, there is no supported public binary release.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability or include sensitive vault contents, credentials, personal paths, or exploit details in a public discussion.

Use [GitHub private vulnerability reporting](https://github.com/omermj/notem/security/advisories/new). Include:

- The affected NoteM version, operating system, and architecture.
- A concise description of the impact and required attacker capabilities.
- Reproduction steps using a minimal synthetic vault.
- Relevant logs with tokens, usernames, email addresses, local paths, and note content redacted.
- Whether you believe the issue is already being exploited or publicly known.

Private vulnerability reporting must be enabled when the repository becomes public. If the private-report button is unavailable, do not publish the details; wait for the private channel to be enabled.

The maintainer will handle reports on a best-effort basis, coordinate a fix and disclosure when warranted, and credit reporters who request attribution. The project does not currently operate a bug-bounty program and cannot promise a particular response or remediation deadline.

## Scope

Security-sensitive areas include vault path containment, symlink handling, rendered Markdown and PDF navigation, Tauri IPC commands and capabilities, release artifacts, and dependency vulnerabilities. The documented trust assumptions and residual risks are in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
