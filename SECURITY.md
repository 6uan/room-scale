# Security policy

## Supported versions

RoomScale is pre-1.0 and under active development. Only the `main` branch is
supported. Fixes land on `main`; there are no backports.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting: the **Security** tab →
**Report a vulnerability**. That opens a private thread with the maintainers.

That is the only reporting channel. This project has no security mailing
address, and requests for one will not be answered — please use the Security
tab, which is private and reaches the maintainers directly.

Please include, where you can:

- what the issue is and the impact you think it has,
- the steps or input needed to reproduce it,
- affected files or commits,
- any proof-of-concept, clearly marked.

You will get an acknowledgement within 7 days and a fuller assessment within 30
days. We will tell you when a fix ships and credit you unless you ask us not
to. Please give us a reasonable window to fix the issue before disclosing it
publicly.

## Threat model

RoomScale has no backend, no accounts, and no server-side data. Project data
lives in the user's own browser (IndexedDB) and leaves it only when the user
exports a file. See
[ADR 0002](docs/adr/0002-local-first-persistence.md).

That shapes what counts as a vulnerability here.

**In scope**

- Cross-site scripting, including through imported project files or
  user-entered product names, URLs, and notes
- Unsafe handling of imported JSON or CSV — prototype pollution, code
  execution, path traversal in a filename
- `javascript:` or other dangerous URL schemes reaching a rendered link
- Anything that causes project data to be sent off the device
- Dependency vulnerabilities that are actually reachable from our code
- Supply-chain problems in the build or release process

**Out of scope**

- Access to IndexedDB by someone who already controls the browser profile or
  the machine. Local data is not encrypted, and this is documented behaviour.
- Loss of data after the user clears site data, uses a private window, or the
  browser evicts storage. This is a known limitation, recorded in ADR 0002.
- Missing security headers on a deployment we do not control.
- Denial of service caused by the user entering an absurd number of objects.
- Automated scanner output with no demonstrated impact on this codebase.
