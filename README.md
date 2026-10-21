# Gather

Gather is a full-stack social platform starter built with Next.js App Router, React, TypeScript, Tailwind, Auth.js, Prisma, PostgreSQL, Redis, S3-compatible storage, and Socket.IO.

## Run locally

1. Install Node.js 20.9+ and pnpm, then copy `.env.example` to `.env` and replace `AUTH_SECRET` with a long random value.
2. Start the local database and cache with `docker compose up -d`.
3. Install packages with `pnpm install`.
4. Apply the checked-in database schema with `pnpm db:migrate`.
5. Start the web app with `pnpm dev`; open `http://localhost:3000`. Start live messaging in a second terminal with `pnpm socket:dev`.

Registration, email/password sign-in, password reset, OAuth sign-in, profile and cover photos, profile privacy, cursor-paginated feed, group/page publishing, post editing/deletion/sharing, photo/video posts, feeling tags, six reaction types, threaded comments, friend requests and blocking, expiring story playback, private group invitations and role management, page following, filtered search, notifications, chat attachments/reactions, presence, typing indicators, and read receipts are included. The responsive app navigation exposes these screens. OAuth providers appear when credentials are supplied. PostgreSQL is required. Redis and S3 settings are optional for core web startup. In development, uploads without S3 use local files in `public/uploads`; production media uploads require S3-compatible storage. Live chat runs in the separate Socket.IO process.

## Production configuration

Use managed PostgreSQL, a TLS-protected Redis instance, private S3 storage with a CDN or signed read URLs, and a durable email provider. Set `AUTH_SECRET`, `AUTH_URL`, provider credentials, SMTP, S3, and socket origin values in your deployment environment. Run `pnpm db:migrate` during deployment; it applies checked-in migrations without requiring database-creation privileges. Use `pnpm db:dev-migration --name <migration>` when authoring migrations locally (Prisma development migrations require permission to create a temporary shadow database). Run the Socket.IO process separately and configure sticky routing or a Redis Socket.IO adapter when horizontally scaling it. Configure rate limits, abuse reporting/moderation, backups, retention, and operational monitoring before opening public registration.

## Structure

- `src/app`: App Router pages and authenticated API endpoints
- `src/components`: responsive authentication, feed, messaging, and social feature screens
- `src/store`: Zustand navigation and conversation state
- `src/lib`: database, validation, Redis, friends, media storage
- `prisma/schema.prisma`: normalized relational schema and indexes
- `server/realtime.ts`: Socket.IO messaging and presence foundation
- `docker-compose.yml`: local PostgreSQL and Redis
