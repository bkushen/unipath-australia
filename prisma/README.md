# Prisma schema status

`schema.prisma` is currently a conceptual/domain model retained for architecture reference. It is **not** the production migration source of truth.

The live UniPath database schema is managed through the versioned SQL files in `supabase/migrations/` and Supabase migration history. Do not run `prisma migrate` against production from the conceptual schema until it has been regenerated/reconciled with the live database.
