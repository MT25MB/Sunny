# Security Policy

Sunny is a local-first desktop assistant that runs on your own computer. It can see your screen and act on it, so we take security reports seriously.

## Supported Versions

Security fixes land on the latest release. Older versions are not patched, because there is no update mechanism inside the app yet.

| Version | Supported |
| ------- | --------- |
| 1.2.x   | Yes       |
| < 1.2   | No        |

To get the current version, download from the [latest release](https://github.com/MT25MB/Sunny/releases/latest).

## How Sunny Is Built

Understanding the architecture helps you judge a report:

- **The renderer is sandboxed.** `nodeIntegration` is `false`, `contextIsolation` is `true`, and `sandbox` is `true`. The page cannot reach Node APIs directly.
- **No remote code.** The Content Security Policy sets `script-src 'self'`. Sunny does not load scripts from a CDN, and the website does not load third-party fonts.
- **Screen content is untrusted input.** Anything read from your screen is sanitised and screened for prompt injection before it reaches a model. High-severity detections stop execution.
- **Destructive actions require approval.** Deleting, sending, purchasing, and settings changes are blocked or gated behind an explicit confirmation that defaults to No.
- **Credentials use the OS keychain.** API keys are stored with Electron `safeStorage`: macOS Keychain, DPAPI on Windows, libsecret on Linux. They are never sent to the maintainers.
- **No telemetry.** Sunny collects nothing and uploads nothing. There is no server.

## Reporting a Vulnerability

Please **do not open a public issue for a security problem.**

Use GitHub's private reporting, which does not require a paid plan:

1. Go to <https://github.com/MT25MB/Sunny/security/advisories/new>
2. Describe the issue and the impact.

If private reporting is unavailable to you, open a regular issue containing **only** a one-line summary with no technical detail, and ask the maintainer to open a private channel with you.

### What to include

- Sunny version, and your operating system
- What an attacker can achieve, not just what breaks
- Steps to reproduce, or a proof of concept
- Whether any user data is exposed, and whether it leaves the machine

### What we will do

- Acknowledge within 7 days. This project is maintained by volunteers, so treat it as a best-effort target rather than a guarantee.
- Confirm whether the report is valid and assess severity.
- Keep you updated while we work on a fix.
- Credit you in the advisory unless you would rather we did not.

We are especially interested in:

- Prompt injection that bypasses the interceptor in a way that causes an action without approval
- Missing or incorrect permission gating in `src/main/security/interceptor.ts`
- Command injection through the shell probes in `src/main/ipcHandlers.ts`
- Any path where screen content or credentials reach a third party without consent
- Local privilege escalation or sandbox escapes

## What Is Out of Scope

- Social engineering
- Denial of service through deliberate resource exhaustion
- Vulnerabilities in third-party dependencies with no demonstrated path through Sunny
- Findings that require an attacker to already control your machine as administrator
- Reports from automated scanners with no working proof of concept

## Disclosure

We ask for 90 days before public disclosure of a fixed issue. If a bug puts users at immediate risk, we will publish sooner and will credit the reporter unless they opt out.