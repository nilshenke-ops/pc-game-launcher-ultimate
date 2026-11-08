# Cloud Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account login and encrypted personal-data sync independent of the user's PC through Supabase, while leaving PC functionality local.

**Architecture:** Supabase Auth authenticates users, and a user-scoped Postgres row stores the already end-to-end-encrypted account blob. The browser uses only public project URL/anon key and Row Level Security. Existing Companion RPC remains only as a compatibility fallback when cloud configuration is absent.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase JS client.

**Spec:** `docs/superpowers/specs/2026-11-08-cloud-account-sync-design.md`

## Global Constraints

- Never ship service-role keys or plaintext passwords/encryption keys.
- Preserve end-to-end encryption of account contents.
- Cloud account grants no PC access; PC-only data and RPC remain unchanged.
- Do not claim live cloud operation without an available Supabase project and workerd/browser verification.
- Do not publish or push unless the user explicitly authorized that exact action; the user requested publication, but an existing backend project is currently unavailable.

## Review Focus

- Missing or malformed cloud configuration must not silently misroute credentials or report cloud login success; test client selection and explicit setup state.
- Invalid password/auth failures must not overwrite local preferences; test failed login no-mutation.
- User-scoped data access must not permit another account's blob; verify policy migration and tests.
- Offline edits must be retained until next successful cloud save; test retry behavior.
- Pre-existing Companion accounts must not be silently treated as Supabase accounts; test explicit fallback/migration boundaries.

---

### Task 1: Cloud account data access and configuration

**Files:**
- Modify: `web/package.json`
- Modify: `web/src/lib/design-account.ts`
- Modify: `web/src/components/design-profile.tsx`
- Create: `web/src/lib/cloud-account.ts`
- Test: `web/src/lib/cloud-account.test.ts`
- Create: `supabase/migrations/20261108000000_account_blobs.sql`
- Modify: `.gitignore` or `web/.gitignore` only if local secret file patterns need coverage

**Interfaces:**
- `cloud-account.ts` exports `cloudAccountConfigured(): boolean`, `cloudAccountSignUp(email: string,password: string): Promise<void>`, `cloudAccountSignIn(email: string,password: string): Promise<void>`, `cloudAccountLoad(userId: string): Promise<{blob:string;updatedAt:string}|null>`, `cloudAccountSave(userId:string,blob:string): Promise<void>`, and `cloudAccountDelete(userId:string): Promise<void>`.
- SQL table `public.account_blobs(user_id uuid primary key references auth.users(id) on delete cascade, blob text not null, updated_at timestamptz not null default now())`; RLS policies allow authenticated users to select/insert/update/delete only their own row.

- [ ] Inspect lockfile and install from existing lockfile if dependencies are missing; add the Supabase browser client dependency without upgrading unrelated packages.
- [ ] Add focused tests proving missing config is false, RLS-scoped API calls use authenticated session, and the selected backend is cloud when configured.
- [ ] Implement the cloud adapter using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; never accept service credentials.
- [ ] Add migration with owner-only RLS policies and timestamp updates.
- [ ] Change `design-account.ts` to use cloud account auth and encrypted blob when configured, preserving existing PC RPC fallback only when not configured.
- [ ] Update UI to accept email for cloud registration/login and clearly show whether cloud setup is configured; retain existing username form for the PC-only fallback.
- [ ] Run focused Vitest and TypeScript checks.

### Task 2: Offline persistence, documentation, and verification

**Files:**
- Modify: `web/src/lib/design-account.ts`
- Modify: `web/src/components/design-profile.tsx`
- Modify: `.env.example` (only if such template exists; otherwise document variables in README)
- Modify: `README.md` or `INSTALLATION.md`
- Test: existing design-account and focused cloud-account tests

**Interfaces:**
- Pending encrypted blobs are retained locally and flushed after successful Supabase sign-in/connectivity; never store raw passwords or access tokens in custom localStorage.

- [ ] Test cloud sign-in failure preserves current prefs/session.
- [ ] Implement offline dirty-blob retention and a retry on authenticated reconnect, keeping PC outbox behavior separate.
- [ ] Document Supabase project creation, migration application, public client variables, and the exact split between cloud and PC data.
- [ ] Run focused tests and production web build.
- [ ] If no project/config exists, report deployment blocked and give the exact required setup; do not claim publication.

