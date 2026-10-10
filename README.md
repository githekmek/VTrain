# VTrain · Beta 0.2.0

Mobile-first vocabulary trainer for German and Brazilian Portuguese. React/Vite frontend, Vercel Node functions, Neon PostgreSQL.

## Implemented

- German / Brazilian Portuguese interface selectable before login
- Explicit offline-capable demo with device-local progress, separate from real accounts
- Invitation-only account creation and password login; HttpOnly session cookies, scrypt password hashes, database-backed login throttling
- Per-user learning direction and spaced repetition, active translation, listening/dictation with device speech or partner recordings
- 20 starter expressions; shared tandem cards, example sentences, explanations and short microphone recordings
- Individual progress and server-validated answers, XP only for due reviews, daily goal, tandem XP
- Responsive layout, web manifest and cached app shell

## Beta im Browser einrichten

1. In Vercel das GitHub-Repository `githekmek/VTrain` importieren. Produktionsbranch: `main`, Framework: Vite, Build: `npm run build`, Ausgabe: `dist`, Installation: `npm install`, Node: 22.
2. Im Neon-Dashboard das bestehende Projekt und die gewünschte Datenbank wählen. Im SQL Editor den gesamten Inhalt von [db/beta-setup.sql](db/beta-setup.sql) ausführen. Das Skript legt Tabellen und 20 Starterkarten an und kann erneut ausgeführt werden.
3. In Neon über **Connect** die vollständige gepoolte PostgreSQL-Verbindungsadresse kopieren, ohne Shell-Befehl oder umschließende Anführungszeichen.
4. In Vercel **Project → Settings → Environment Variables** für **Production** setzen:
   - `DATABASE_URL`: die komplette Neon-Verbindungsadresse, als Secret.
   - `ALLOWED_EMAILS`: eure beiden E-Mail-Adressen, durch Komma getrennt.
   - `INVITE_CODE`: einen privat generierten zufälligen Code mit mindestens 20 Zeichen, als Secret.
5. Ein neues Production-Deployment von `main` erstellen. Bestehende Deployments übernehmen neue Variablen nicht.
6. Die stabile Production-Domain unter **Domains** verwenden. In einem privaten Browserfenster testen, dass sie ohne Vercel-Konto zugänglich ist. Eventuelle organisationsweite Zugangsvorgaben müssen vom zuständigen Administrator freigegeben werden.
7. Spielpartner öffnet die Adresse, wählt **Português → Continuar → Criar conta**, trägt seine freigeschaltete E-Mail und euren Einladungscode ein und wählt **Estou aprendendo: Deutsch**. Jeder legt sein eigenes Passwort fest.

Die Anmeldemaske wird erst bei erreichbarer, eingerichteter Datenbank aktiv. Neue Konten sind zusätzlich nur bei gesetzter E-Mail-Freigabe und gültiger Einladungskonfiguration möglich. Passwörter und Verbindungsadressen gehören weder in GitHub noch in den Chat.

## Local use

Node 22. Run `npm install`, `npm run dev`. Vite alone provides the frontend/demo; use `vercel dev` for API routes and real login. Secure cookies require HTTPS for authenticated sessions (local HTTPS proxy or Vercel preview).

`npm test`, `npm run check`, `npm run build`.

## Vercel / Neon setup

1. Import this repository into the desired Vercel team. Framework: Vite; build: `npm run build`; output: `dist`. Serverless functions are under `api/`.
2. Set **DATABASE_URL** privately in Vercel, using the complete Neon connection string (user, password, database, TLS parameters). The hostname alone is insufficient. Never put this in a VITE_ variable or commit it.
3. Set **ALLOWED_EMAILS** to the two permitted email addresses and **INVITE_CODE** to a randomly generated secret of at least 20 characters. Share the code privately. These initial accounts join the pilot tandem.
4. Run `npm run migrate` once against the intended database, with DATABASE_URL provided securely in the shell environment. The migration is additive and seeds starter cards. Do not run it automatically during every build.
5. Deploy a preview, register both accounts and exercise login, vocabulary, recording, reload and sign-out on real iOS Safari and Android Chrome. Then promote to production.

Database region: Vercel functions use Frankfurt (`fra1`) for the supplied Neon EU Central region. Do not point automated tests at production.

## Boundaries of this first version

- This is the first invitation-only beta. Deployment and registration on the actual target domain must be verified after environment setup; real iOS/Android device testing remains outstanding.
- The service worker caches only public app assets, never API responses. Demo works offline after first load. Authenticated offline review and cross-device conflict resolution are not implemented.
- Audio is limited to 20 seconds / 500 KB, kept as JSON base64 in PostgreSQL for this small pilot. Before wider rollout, migrate it to private object storage with authorized reads, quotas and cleanup.
- Listening uses a recording when its language matches; otherwise it uses the device voice. Speech recognition / pronunciation scoring is not implemented.
- Progress is individual, cards are visible only to their tandem or are global starter cards. Teams are modeled in the schema, but self-service tandem creation/invitations are not implemented.
- Registration requires an allowlisted email and shared pilot invite; email verification, password reset, and account deletion UI remain to be implemented.
- Daily counts reset at database midnight (UTC). Streaks, travel map, weekly missions and correction threads remain future iterations.
- Native install support varies by browser. Manifest currently has an SVG icon; raster icons and Apple touch icon are pending final PWA polish.
- UI language is device-local; learning direction is selected during registration and currently fixed for that account.
- All answers preserve accents. Multiple accepted translations can be separated with `|`.
- Dependency ranges are declared; produce and commit a lockfile using a working local runtime before production release.

## Security model

Backend queries scope tandem resources by the authenticated user's team, not a client-provided team ID. Review updates lock the progress row in a transaction so concurrent submissions cannot award duplicate XP. Sessions are hashed in storage. POST requests require a same-origin Origin header and JSON content type. Auth throttling counts attempts by a hash of the deployment-provided client IP. Secrets never enter the frontend bundle.

The initial migration creates a single pilot team; adding users does not require schema changes. Production email verification and password recovery should use a transactional email provider or a managed authentication service.

## Bestehende Vokabeln bearbeiten

In der Detailansicht **Vokabel bearbeiten / Editar palavra** wählen. Alle Mitglieder desselben Tandems können dessen gemeinsame Karten bearbeiten, einschließlich Text, Beispielsatz, Erklärung, Thema und Aufnahme (beibehalten, ersetzen oder entfernen). Starterkarten werden beim ersten Bearbeiten für das Tandem kopiert; andere Tandems behalten die Originale.

Dieses Update benötigt **keine Schema-Migration** und kein erneutes Beta-Setup. Bestehende Accounts, Passwörter, Sessions, XP und Lernstufen bleiben bestehen. Reine Änderungen an Notizen, Beispielen, Kategorien oder Audio behalten den Wiederholungstermin bei. Geänderte Wörter setzen nur die betroffene Karte für bestehende Lernstände des Tandems auf sofort fällig, ohne Lernstufen oder Historie zurückzusetzen. Gleichzeitige Änderungen werden mit einer Konfliktmeldung abgefangen. Nach einem Update die App neu laden, damit der neue Editor erscheint.
