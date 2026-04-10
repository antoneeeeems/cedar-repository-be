---
paths:
  - "middleware.ts"
  - "src/lib/supabase/**"
  - "src/lib/admin/**"
  - "src/app/(auth)/**"
  - "src/app/admin/**"
---

# Security

- Validate all user input at the system boundary. Never trust request parameters or form data.
- Use Supabase parameterized queries / RLS policies — never concatenate user input into SQL.
- Sanitize output to prevent XSS. Rely on React's default escaping; audit any `dangerouslySetInnerHTML`.
- Keep Supabase session handling aligned with `hydrateAdminSessionFromSupabase`; never store tokens in localStorage-only.
- Never log secrets, tokens, passwords, or PII (email, student IDs).
- Use constant-time comparison for secrets and tokens.
- Preserve middleware admin-route guards (`/admin/:path*` redirects unauthenticated users to `/login`).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client — `NEXT_PUBLIC_*` keys only in browser code.
