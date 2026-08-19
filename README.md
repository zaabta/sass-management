# VCFO SaaS Management — Frontend

Customer Application **+** SaaS Admin Console for the VCFO commercial platform.

The backend SaaS/Tenant/Subscription layer is a **separate service** and remains
the security boundary. This repository contains only the frontend: presentation,
navigation, forms, filtering, UX, localization, loading/error states, feature
visibility and subscription messaging.

```
                        VCFO FRONTEND
                             │
              ┌──────────────┴──────────────┐
              │                             │
        CUSTOMER APP                   SAAS ADMIN
              │                             │
         /api/v1/*                   /api/v1/admin/*
              │                             │
        x-company-id                   Platform Role
              │                             │
       Session / Tenant              Customers · Subscriptions
       Subscription · Features      Plans · Features · Payments
       Limits                        Users · Audit
```

## Getting started

```bash
npm install
npm run dev        # http://localhost:4173
npm test           # vitest (25 tests: guards, gating, localization, quotas)
npm run build
```

### Demo accounts (dev mock backend)

Matches the `demo.vcfo-ai.com` behavior: **any email + password of 8+ characters
signs you in** to the demo tenant (data is fully local). Seeded accounts:

| Surface | Email | Password |
| --- | --- | --- |
| Platform SUPER_ADMIN | `admin@vcfo.dev` | `admin123` |
| Platform BILLING_ADMIN | `billing@vcfo.dev` | `admin123` |
| Platform SUPPORT | `support@vcfo.dev` | `admin123` |
| Platform SAAS_ADMIN | `ops@vcfo.dev` | `admin123` |
| Customer owner (Active, Business) | `owner@acme.demo` | `demo1234` |
| Customer owner (Trial) | `owner@crescent.demo` | `demo1234` |
| Customer owner (Expired) | `owner@evergreen.demo` | `demo1234` |
| Customer owner (Suspended) | `owner@halo.demo` | `demo1234` |
| Customer owner (Past due) | `owner@delta.demo` | `demo1234` |

Every new customer created through the wizard signs in with
`owner@<customer-email>` / `demo1234`.

## Architecture

```
src/
  api/            typed services (authApi, customerApi, saasAdminApi), client,
                  domain types — the ONLY place endpoints are referenced
  components/     UI kit (badges, tables, drawers, modals, skeletons…),
                  FeatureRoute, SubscriptionBanner
  hooks/          useSession · useTenant · useSubscription · useFeature ·
                  useLimit · canUseFeature (shared subscription state)
  i18n/           en / ar (RTL) / tr / fr + backend error-code mapping
  lib/            format (currency/date/expiry), queryKeys, error mapping
  features/
    customer/     Customer Application shell + pages
    saas-admin/   SaaS Management Console (role-aware)
server/mock/      DEV-ONLY in-memory backend implementing the documented
                  contracts, mounted as Vite middleware (see below)
```

### Session bootstrap

`GET /api/v1/auth/session` is fetched **once** in the application shell
(`SessionGate`) and cached in TanStack Query. All pages consume it through the
shared hooks — subscription state is never refetched per page.

### Feature & quota UX

- `useFeature('FORECAST')` → resolved feature for the current tenant
- `useLimit('MAX_BRANCHES')` → plan limit
- `<FeatureRoute feature="FORECAST">` → renders children, or a localized
  locked/expired/suspended panel (backend stays authoritative)
- Quota usage is displayed as `current / limit` (`∞` for unlimited, never `null`)
- Nothing is decided from the **plan name**; only resolved features/limits are used

### Error-code localization

Backend machine codes are mapped to i18n keys and never shown raw:

| Code | i18n key |
| --- | --- |
| `FEATURE_NOT_INCLUDED` | `subscription.feature_not_included` |
| `FEATURE_DISABLED` | `subscription.feature_disabled` |
| `FEATURE_LIMIT_REACHED` | `subscription.limit_reached` |
| `SUBSCRIPTION_EXPIRED` | `subscription.expired.title` |

### Expired-customer experience

Expired/suspended/cancelled customers can still sign in. The shell restricts
navigation to **Account · Subscription · Support · Log out**, hides
Dashboard/Analytics/Uploads/Forecast/Scenario/Budget/Exports, and shows a
localized expired banner/page with plan, expiry date and the contact message.
The backend additionally returns `SUBSCRIPTION_EXPIRED` / `SUBSCRIPTION_SUSPENDED`
from gated endpoints.

### SaaS Admin — role-based surface

| Section | SUPER_ADMIN | SAAS_ADMIN | BILLING_ADMIN | SUPPORT |
| --- | :-: | :-: | :-: | :-: |
| Overview | ✓ | ✓ | ✓ | ✓ |
| Customers | ✓ | ✓ | read | read |
| Subscriptions | ✓ | ✓ | ✓ | — |
| Plans / Features | ✓ | ✓ | — | — |
| Payments | ✓ | — | ✓ | — |
| Users (customer) | ✓ | ✓ | — | read |
| Platform Users | ✓ | — | — | — |
| Audit | ✓ | ✓ | ✓ | — |

Customer OWNER (any customer role) is never shown the SaaS Admin; route guards
redirect to the customer app and the backend returns 403 for
`/api/v1/admin/*` (verified by tests).

### TanStack Query keys

```
['saas-admin','customers', filters]   ['saas-admin','customer', id]
['saas-admin','subscriptions', …]     ['saas-admin','payments', …]
['saas-admin','plans']                ['saas-admin','features']
['saas-admin','users', …]             ['saas-admin','audit', …]
```

After commercial mutations (renew/extend/payment/override/status changes) the
customer, subscription, history, overview and audit keys are invalidated.

## Contract alignment (NestJS backend)

The frontend is built against the contract in the product spec:

- **Envelope**: success `{ success, data, timestamp }` unwrapped once in the
  HTTP client; errors `{ statusCode, message: string|string[], code }` are
  normalized to `ApiError.messages[]` and never shown raw.
- **Auth/headers**: login returns the token **inside the envelope** —
  `data.accessToken` (never `json.accessToken`). It is stored (localStorage
  key `accessToken`, or sessionStorage when "remember me" is off) and sent as
  `Authorization: Bearer <accessToken>` on **every** request, including
  `/auth/session`. No cookies. Session is only called *after* login resolves.
  Tokens are short-lived (~15 min): on 401 the shell clears the token and
  returns to login. Missing header → `401 Missing Authorization header. After
  login send: Authorization: Bearer <accessToken>`. `x-company-id` is sent on
  every customer call (never on `/api/v1/admin/*`), `Accept-Language` from the
  active locale.
- **Session bootstrap** once per shell; company switcher calls
  `GET /api/v1/companies` (no header), persists the choice, re-bootstraps
  session with `x-company-id`.
- **Entitlements**: hooks `useSession/useSubscription/useFeature/useLimit`,
  `<FeatureRoute feature>`, `<LimitHint feature usage>`; locked pages show
  the plan(s) that include the feature (display catalog only — session stays
  the source of truth; no `if (plan === …)` logic).
- **Customer app**: nav groups Home/Books/Truth/Statements/Analytics/Planning/
  Workspace/Account; `GET /dashboard` renders `impact_direction`-colored KPIs,
  `pp` changes, `null → —`, integrity-failed banner, trend joined on `period`,
  and hides budget UI when `targets_available === false`. Workspace pages
  (companies/branches/users) enforce quotas via `FEATURE_LIMIT_REACHED` UX.
- **Plans & features**: `GET /api/v1/admin/plans` returns the backend shape
  (`isActive`, string `monthlyPrice`/`annualPrice`, nested
  `features[].feature.{key,name,type}`, string `limitValue`s, `_count.subscriptions`).
  The service layer normalizes this into the domain `Plan` (`status`,
  numeric prices/limits, `limits` map, `customersCount`) so the feature matrix,
  quota rows, wizard cards and plan editor consume one stable shape.
  Writes map `status → isActive` and coerce values back to the backend form.
- **SaaS Admin**: `saas.*` permission matrix (SUPER_ADMIN all; SAAS_ADMIN
  payment.read only; BILLING_ADMIN subscription+payment write, customer
  read-only; SUPPORT read-only incl. audit). Wizard sends `idempotencyKey`
  (double-submit = replay, not duplicate); writes send `expectedVersion`
  (stale → `RESOURCE_VERSION_CONFLICT` toast + reload); catalog price edits
  show the "price list only" warning; payments are manual with idempotency.
- **i18n**: backend catalogs `GET /api/v1/i18n/languages` and
  `/api/v1/i18n/catalog?lang=` are merged over bundled en/ar(RTL)/tr/fr
  dictionaries; `direction` from the catalog drives `dir`.

## The dev-only mock backend (`server/mock`)

This repository does not contain the real VCFO backend service, so the
frontend ships with a **dev-only in-memory mock** that implements the documented
contracts (`/api/v1/auth/session`, `/api/v1/auth/login`, `/api/v1/admin/*`, …)
as Vite middleware. It plays the role of the security boundary during
development: tenant isolation, entitlement resolution, quota enforcement,
platform-role permissions and error codes are all enforced there so the UI is
exercised exactly as it will be against the real backend.

It is **not** part of the application logic and is disabled when
`VITE_MOCK_API=false`. Point the app at the real backend with:

```
VITE_MOCK_API=false VITE_API_BASE_URL=https://api.vcfo.example/api/v1 npm run dev
```

The mock is stateful in-memory (seeded demo data resets on server restart).

## Contract assumptions (to reconcile with the real backend)

The mock follows the contracts documented in the product spec. When the real
backend is attached, verify these assumptions:

1. `GET /api/v1/auth/session` returns `{user, customers[], tenant}` as specified;
   the tenant additionally carries `usage` (quota counters) — optional, the UI
   degrades gracefully if absent.
2. Admin routes use the paths in `src/api/services.ts` (e.g.
   `POST /api/v1/admin/customers` accepts the full wizard payload and creates
   customer + subscription + owner + company + overrides atomically).
3. Commercial operations return machine-readable error bodies
   `{code, message, details}`.
4. There is no online payment provider — payments are manual records
   (`BANK_TRANSFER | CASH | MANUAL | OTHER`, status `PENDING | PAID | VOID | REFUNDED`),
   and recording a payment never auto-changes subscription entitlement.

If an operation in the UI has no matching backend endpoint, the drawer/CTA
surfaces the backend error rather than simulating local state.

## Tests

`npm test` covers (spec §68–§77):

- Customer OWNER cannot access any SaaS Admin section; per-role section access
- FeatureRoute: enabled → children; not included / expired / suspended → locked
  panels; raw backend codes never rendered
- Expired/suspended/cancelled tenants restrict the app; suspended customer
  status restricts even with an ACTIVE subscription
- Entitlement derives from resolved features, not plan name
- Quota display helpers (`3 / 3`, `30 / ∞`, never `null`)
- Expiry display states (today / in N days / N days ago)
- Error-code localization across en, ar, tr, fr

## Design system

The UI follows the VCFO financial-intelligence identity (`desgin.md`): off-white
canvas `#F6F7F8`, white cards with `#F1F3F4` strips, hairline `#E3E7EB` borders,
ink `#0F172A` typography (Alexandria headings, IBM Plex Sans Arabic UI,
IBM Plex Mono numerics with `tabular-nums`), teal "truth" primary
`#1F8578 / #2A8C7F / #7FB3AB`, mono uppercase status pills
(VALID / WARNING / REVIEW / FAILED semantics), KPI cards with colored deltas,
teal semicircle health gauges (customer financial health + platform health),
eyebrow labels, faint 44px hero grids, teal underline marks, a lineage flow
(Uploaded File → Trial Balance → Mapped Accounts → Financial Truth) on the
uploads page, dark ink primary buttons (12px radius), and RTL-reversed chart
time axes in Arabic.
