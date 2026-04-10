---
paths:
  - "src/lib/admin/**"
  - "src/lib/supabase/**"
  - "src/lib/repository/**"
  - "src/lib/repository-v2/**"
  - "middleware.ts"
---

# Error Handling

- Use typed error shapes with codes — not generic `Error("something went wrong")`.
- Never swallow errors silently. Log or rethrow with added context about what operation failed.
- Every repository method is async — always `await` and handle rejection. No floating promises.
- When a Supabase call returns `{ data, error }`, check `error` first and surface it, don't silently fall through.
- Never expose stack traces, internal paths, or raw Supabase errors to end users — map to friendly messages in UI.
- Retry transient network errors with short backoff; fail fast on auth/validation errors.
- Preserve the mock repository fallback path — surface a clear error when Supabase config is missing, don't crash.
