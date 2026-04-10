---
paths:
  - "supabase/migrations/**"
  - "supabase/bootstrap.sql"
---

# Database Migrations (Supabase / Postgres)

- **Never modify an existing migration** — always add a new migration. Existing files may already be applied in Supabase.
- Migration filenames use timestamp prefix (`YYYYMMDDNNNN_name.sql`); new migrations go at the end.
- `supabase/bootstrap.sql` is the canonical scratch init script — keep it in sync when adding foundational tables.
- Never seed production data in a migration — use a dedicated sample-data migration clearly labeled as such (see `202603190005_expand_sample_data.sql`).
- Never drop columns or tables without first confirming the data is no longer needed and RLS policies are updated.
- Add indexes in their own migration (see `202603190006_public_catalog_performance_indexes.sql`) so they can be rolled back independently.
- Include RLS policies alongside the table they protect. Never leave a new table without RLS enabled.
