# @studid/better-auth-studid

[![npm version](https://img.shields.io/npm/v/@studid/better-auth-studid?color=blue)](https://www.npmjs.com/package/@studid/better-auth-studid)
[![License](https://img.shields.io/github/license/andrwagn/better-auth-studid?color=blue)](LICENSE)
[![CI](https://github.com/andrwagn/better-auth-studid/actions/workflows/ci.yml/badge.svg)](https://github.com/andrwagn/better-auth-studid/actions/workflows/ci.yml)

Sign in with your university — a [Better Auth](https://better-auth.com) plugin for [Studid](https://studid.io). Authenticate users from thousands of institutions across 70+ national federations (eduGAIN) via SAML, with zero SAML knowledge required.

> Try it live: [better-auth-demo.studid.io](https://better-auth-demo.studid.io/)

## Installation

```bash
npm install @studid/better-auth-studid
```

## Quick Start

### 1. Server setup

```ts
// auth.ts
import { betterAuth } from 'better-auth'
import { studid } from '@studid/better-auth-studid'

export const auth = betterAuth({
  database: {
    provider: 'pg',
    url: process.env.DATABASE_URL,
  },
  plugins: [
    studid({
      serviceName: 'My App',
    }),
  ],
})
```

### 2. Client setup

```ts
// auth-client.ts
import { createAuthClient } from 'better-auth/client'
import { studidClient } from '@studid/better-auth-studid/client'

export const authClient = createAuthClient({
  plugins: [studidClient()],
})
```

### 3. Sign-in button

```tsx
import { authClient } from './auth-client'

function LoginPage() {
  return <button onClick={() => authClient.signIn.studid()}>
    Sign in with your university
  </button>
}
```

## Configuration

```ts
studid({
  // Studid API base URL
  baseUrl: 'https://studid.io',

  // Application name shown in the Studid UI
  serviceName: 'My App',

  // Minimum auth identifier type to accept (default: 'persistent-nameid')
  //   persistent-nameid → pairwise-id + persistent nameId (best for auth)
  //   pairwise-id       → strictest, per-SP pseudonym only
  //   email             → also accept verified institutional emails
  //   none              → accept any, including transient (no persistent account)
  minIdentifierType: 'persistent-nameid',

  // Reject transient identifiers (default: true)
  // When true, auth fails if the IdP returns no persistent identifier.
  requirePersistent: true,

  // Domain for auto-generated user emails (default: 'uni.verification')
  emailDomain: 'myapp.university',

  // Custom callback URL (auto-derived from better-auth baseURL if not set)
  callbackUrl: 'https://myapp.com/api/auth/studid/callback',

  // Redirect after successful auth, or a callback
  onSuccess: '/dashboard',
  // onSuccess: (data) => data.affiliations.includes('staff') ? '/admin' : '/dashboard',
})
```

## Client Options

The client `signIn.studid()` accepts an optional config object:

```ts
authClient.signIn.studid({
  // Override the post-login redirect URL for this invocation (optional)
  callbackURL: '/dashboard',
  // Open Studid in a new tab instead of redirecting (optional)
  newTab: true,
})
```

When `callbackURL` is provided, it takes priority over the server-side `onSuccess` configuration.

## User Fields

The plugin adds these fields to the `user` table:

| Field | Type | Description |
|-------|------|-------------|
| `verifiedEntityId` | `string?` | SAML entity ID of the authenticating institution |
| `verifiedAuthIdentifier` | `string?` | The persistent identifier used for account linking |
| `verifiedAffiliations` | `string?` | JSON-encoded array of eduPerson affiliations (often empty) |

Session fields (available via `useSession()`):

| Field | Type |
|-------|------|
| `verifiedEntityId` | `string?` |
| `verifiedAffiliations` | `string?` |

## How It Works

### Account Model

The plugin uses better-auth's `account` table, matching the OAuth provider pattern:

| Column | Value |
|--------|-------|
| `providerId` | `"studid"` |
| `accountId` | `"{entityId}::{authIdentifier}"` |

The composite `accountId` prevents cross-institution collisions and account takeover — a different institution cannot assert the same identifier.

### Identifier Priority

| Priority | Source | Type | Account created? |
|----------|--------|------|-----------------|
| 1 | pairwiseId | `pairwise-id` | Yes (recommended) |
| 2 | persistent nameId | `persistent-nameid` | Yes (with `persistent-nameid` min) |
| 3 | email nameId | `email` | Yes (with `email` min) |
| 4 | none | `null` | No (transient — `requirePersistent` controls behavior) |

### Re-authentication

Returning users are matched via the `account` table — the email is not used for lookup. This means the generated email is purely structural and never sent to.

### Session Data

After authentication, session metadata is populated:

```ts
const { data: session } = await authClient.useSession()
// session.verifiedEntityId → "https://idp.uni.edu/idp/shibboleth"
```

## `onSuccess` Callback

```ts
studid({
  onSuccess: (data) => {
    // data.entityId           → institution SAML entity ID
    // data.authIdentifier     → persistent user ID (null if transient)
    // data.authIdentifierType → type of identifier
    // data.affiliations       → eduPerson affiliations (often empty)

    if (data.affiliations.includes('staff')) {
      return '/admin'
    }
    return '/dashboard'
  },
})
```

## Common Failure Scenarios

| Scenario | What happens | How to fix |
|----------|-------------|------------|
| IdP returns transient nameId | `requirePersistent: true` → error. User cannot create an account. | Set `requirePersistent: false` if transient access is acceptable. |
| IdP returns email but `minIdentifierType` is `persistent-nameid` | Error: "requires at least persistent-nameid". User cannot create an account. | Lower `minIdentifierType` to `email`, or contact the IdP about releasing persistent identifiers. |
| User cancels at IdP login page | Verification never completes. User sees "University login was not completed." | User should close the tab and try again from the app. |
| Verification expires (>1 hour) | Cookie state expires after 30 min. "Session expired" error. | User starts again from the app. |
| IdP is down or unreachable | SAML flow fails. Studid shows an error. User cannot authenticate. | Check if the institution's IdP is operational. Users can try again later. |
| Cookie blocked by browser | No `studid_state` cookie on callback. "Session expired" error. | User must allow cookies for the site, or use a different browser. |
| Studid API returns error | HTTP error from `POST /v2/auth/verification`. Plugin throws. | Check network connectivity and Studid API status at status.studid.io. |
| No affiliations released | `affiliations` array is empty. Normal for most IdPs — Studid is not a R&S entity. | Documented behavior. Use `entityId` and `authIdentifier` for reliable identification. |

## Compatibility with Other Plugins

- **Organizations plugin:** The plugin does NOT auto-assign organization membership based on `entityId`. Use the `verifiedEntityId` field to implement your own org assignment logic if needed.
- **API keys plugin:** API keys are scoped to the user, not the institution. Works normally.
- **Multi-tenant apps:** The `verifiedEntityId` field is ideal for identifying which tenant/institution a user belongs to.

## Development

```bash
git clone https://github.com/andrwagn/better-auth-studid
cd better-auth-studid
bun install
bun run build
```

## Publishing

Releases are fully automated. When changes land on `main`, the release workflow:

1. Analyzes commits since the last tag to determine the next version (patch/minor/major based on [Conventional Commits](https://www.conventionalcommits.org/))
2. Bumps the version, creates a git tag, and pushes it
3. Builds and publishes to npm with provenance
4. Creates a GitHub release with auto-generated notes

### Commit message format

```
feat: add new feature        → minor bump
fix: fix a bug               → patch bump
feat!: breaking change        → major bump
chore: maintenance           → no release
docs: documentation          → no release
```

PR commits are validated automatically by commitlint.

## License

MIT
