# biblio integration audit and runbook

Audited against the merged Auth, Books, Circulation, AI, and Admin implementation and `architecture.md`. The Express/Mongoose, React/Router/Axios architecture and existing endpoint response shapes are preserved. All library features reference the canonical Book ID.

## 1. Integration issues found

| Area | Finding and effect |
| --- | --- |
| Authentication | JWT role claims remained trusted after demotion/deletion; logout only cleared the browser cookie and left replayable tokens. |
| Authentication validation | Unbounded login attempts and passwords beyond bcrypt's 72-byte input limit. Database/session outages looked like logout in the UI. |
| Circulation | Separate writes could leave stock, loans, fines, holds, and notifications inconsistent after failure. Returning twice, cancelling while collecting, or editing/deleting inventory during borrowing could race. |
| Reservations | Concurrent inserts could share positions; queue positions were not compacted; expired holds depended on sporadic traffic. A user could reserve their own active loan. |
| Reservation UI | A held copy has zero public availability, so its owner could not collect it from the book page. |
| Books/API validation | Object-valued query parameters could reach Mongo filters or crash `.trim()`. Invalid IDs and malformed JSON did not consistently return safe error envelopes. |
| Admin | Overdue lists filtered persisted status while dashboard counts also considered due dates. Empty frontend filters conflicted with strict input validation. |
| AI indexing | Atomic source replacement did not coordinate with concurrent book deletion/metadata updates. Deleted books could leave orphan chunks. |
| Recommendations | The activity adapter expected `savedbooks`, but there was no shared model, API, or working save interface. |
| UI | Hidden notification errors, unhandled action failures, duplicate fine requests, stale book-detail requests, repeated action submissions, missing catalogue/admin pagination. |
| Testing/contracts | AI browser fixtures predated protected routes; route tests relied on role claims without real users. Postman had duplicate auth folders, a malformed USER bearer entry, and cookie/bearer identity conflicts. |
| Configuration/docs | Local Mongo example used a standalone server despite transactional indexing; README described old auth and nontransactional inventory. Startup did not validate circulation settings or wait for unique indexes. |

No unresolved import failures, merge markers, or duplicate model definitions were found. The production frontend build resolves its imports. Broad circulation middleware previously intercepted unrelated paths; authentication now attaches to each circulation route.

## 2. Fixes applied

- Resolve current user/role from Mongo on every authenticated request. Token versions revoke existing sessions on logout (including legacy users without a stored version); logout is explicitly **all devices**. Preserve HTTP-only cookies and reject cross-origin state-changing browser requests. Add bounded validation, login/registration throttling, and safe error responses.
- Use a shared per-book transaction for borrowing, returning, renewing, reservation mutations, admin stock changes/deletion, saved-book insertion, and AI source writes. Writing the same Book document makes competing API instances serialize through Mongo transaction retries. Notifications and fines commit with the state change.
- Compact WAITING positions after queue changes, reserve stock for READY holds, reject duplicate/self-loan reservations, expire holds with a periodic worker, and notify the next reader exactly once. Add **Collect reserved copy** to Reservations.
- Preserve unavailable stock allocations when changing only total copies; reject edits that would erase active loans or READY holds. Delete chunks and saved references with the book. Historical returned loans remain as records and display a fallback if the book was removed.
- Validate query types/limits/IDs, hide database internals, normalize 400/401/403/404/409/413/429/5xx responses, and derive overdue filters consistently.
- Keep existing grounded AI selection, verbatim quote validation, current-book hydration, source attribution, and insufficient-context behavior. Serialize indexing with catalogue writes and reject metadata changes during embedding generation with 409.
- Add the architecture's `SavedBook` model and idempotent own-user endpoints: `GET /users/me/saved-books?page=&limit=`, `PUT /users/me/saved-books/:bookId`, `DELETE /users/me/saved-books/:bookId`. Add book-page saving and `/saved-books`; recommendations consume the same records.
- Fix loading/error/retry and busy states, session-expiration navigation, stale detail results, redundant fines fetching, and catalogue/admin table pagination. Preserve the existing designs.
- Add real HTTP integration tests, a real browser/API/database flow, auth UI regressions, an ordered Postman collection, a read-only data audit, trusted admin provisioning, and expanded CI.

### Verification

All nine requested flows run through real Express HTTP endpoints and a real isolated MongoDB replica set, including transactions, indexes, bcrypt, cookies, ownership checks, analytics, BookChunks and exact vector retrieval. Browser tests use the real API for the integrated flow.

**AI test boundary:** only the outbound OpenAI HTTP transport is deterministic. Tests exercise the production provider request/response parser, embedding/indexing pipeline, database retrieval, prompt construction, grounding validation, response contracts and UI. Fixture embeddings test ranking mechanics; they do not establish live model semantic quality. No fake-provider switch is exposed in production.

**52 backend tests, 22 desktop/mobile browser regressions, and one full browser/API integration scenario pass.** Commands below reproduce the suites. The ordered Postman collection was also executed with Newman: **56 requests and 126 assertions passed** against the isolated integration API. Both backend and frontend `npm audit` reported **zero known dependency vulnerabilities** at audit time.

## 3. Remaining issues and deployment checks

- No existing backend environment file, live OpenAI key, or Atlas connection was available. Live embedding relevance, live LLM quality, Atlas index readiness and production latency remain unverified. In Atlas, wait for indexing to become queryable after source import; the exact test mode is synchronous.
- Existing deployed data was not accessible. Before deploying these fixes, run `npm run audit:data --prefix backend` against the intended database and review discrepancies with library staff. The script reports impossible inventory, duplicate active loans/holds, queue gaps and missing Book references; it does not invent repairs or mutate data.
- Production requires Atlas or a replica set and HTTPS. Authentication is designed for a same-site frontend/API deployment. Configure `CLIENT_ORIGIN` exactly, serve the frontend with SPA fallback, and keep secrets server-side.
- Rate-limit counters are in-process. Use a shared limiter store and deliberate trusted-proxy configuration before horizontally scaling. No load test or external penetration test was performed.
- The current MVP records notifications in-app. Email/push delivery, password reset/email verification, payment/fine settlement, and staff mutation workflows for user/loan administration remain product extensions. Admin user/borrowing screens are read-only. The admin book list still displays up to 100 records; ordinary catalogue and admin user/borrowing tables are paginated.
- Reindex after editing searchable catalogue metadata. Stale catalogue chunks are safely excluded meanwhile. Import actual licensed chapter excerpts for chapter-level answers; a description alone is labelled as catalogue context. Learning-path order remains a suggestion, not a verified curriculum.

## 4. Required environment variables

`backend/.env` (copy the example and replace placeholders):

| Variable | Requirement / default |
| --- | --- |
| `MONGODB_URI` | Required. Atlas URI or local replica-set URI, e.g. `mongodb://127.0.0.1:27017/biblio?replicaSet=rs0`. |
| `JWT_SECRET` | Required, unique random value of at least 32 characters; placeholder values are rejected. Generate locally with `openssl rand -hex 32`. |
| `PORT` | `5000` |
| `CLIENT_ORIGIN` | `http://localhost:5173`; exact browser origin. |
| `NODE_ENV` | `development` locally; `production` enables Secure cookies. |
| `LOAN_DAYS` | `14`, integer 1–365. |
| `MAX_RENEWALS` | `2`, integer 0–100. |
| `RESERVATION_HOLD_DAYS` | `3`, integer 1–30. |
| `FINE_PER_DAY` | `1`, number 0–10000; fine is assessed when an overdue loan is returned. |
| `RESERVATION_SWEEP_MS` | `60000`, integer 1000–3600000. |
| `OPENAI_API_KEY` | Required for live AI only. Catalogue/auth/circulation can run without it; AI returns a safe 503. |
| `AI_VECTOR_MODE` | `atlas` in production; `exact` for bounded local collections. |
| `AI_VECTOR_INDEX` | `book_chunks_vector` |
| `AI_EMBEDDING_MODEL` | `text-embedding-3-small` |
| `AI_EMBEDDING_DIMENSIONS` | `1536`; must match stored embeddings and Atlas index dimensions. |
| `AI_CHAT_MODEL` | `gpt-4o-mini`; account must have access to a model supporting the existing structured Responses contract. |
| `AI_MIN_RELEVANCE` | `0.65`; calibrate using actual library queries. |
| `AI_EXACT_MAX_CHUNKS` | `5000`; exact mode fails safely if the bound is exceeded. |
| `AI_TIMEOUT_MS` | `25000` |

`frontend/.env`: `VITE_API_URL=http://localhost:5000/api/v1`. Use the same hostname (`localhost` or `127.0.0.1`) in both browser/API settings. Never put API keys or the JWT secret in `VITE_` variables.

## 5. Final commands

Use Node 22+ (CI uses Node 22). From the repository root:

```sh
npm ci --prefix backend
npm ci --prefix frontend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit those files before starting. For a new isolated local Mongo database, if Docker is available:

```sh
docker run --name biblio-mongo -p 127.0.0.1:27017:27017 -v biblio-mongo-data:/data/db -d mongo:7 --replSet rs0 --bind_ip_all
docker exec biblio-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
```

Run API and frontend in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

Register an administrator candidate in the UI, then grant its role through the trusted local CLI and sign in again:

```sh
npm run admin:grant --prefix backend -- admin@example.edu
```

For live AI, configure the provider, create the Atlas index if using Atlas, and index existing real catalogue records:

```sh
npm run ai:create-vector-index --prefix backend
npm run ai:index --prefix backend
```

For exact mode, skip Atlas index creation. Chapter excerpts are imported through the ADMIN source endpoint documented in `docs/ai-setup.md`.

Verification without private credentials:

```sh
npm test --prefix backend
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm run test:ai
npm run test:integration
```

The first database test run downloads MongoDB. Browser integration uses ports 5005/5175; unit browser regressions use 5173. For installed Chrome, prefix browser commands with `PLAYWRIGHT_CHANNEL=chrome`. The isolated fixture accounts and source text are test-only and are not seeded into the production database.

## 6. Final Postman testing sequence

Import `postman/biblio.integration.postman_collection.json`. Use a disposable/local library. Set `baseUrl`, existing `adminEmail`/`adminPassword`, `userPassword`, and `queueUserPassword`. Leave the cookie jar enabled. New test-user emails are generated for each run.

1. Run **01 Core flows**: register two readers → login → `/auth/me` → logout → verify 401 → admin login → create/update/delete a disposable book → create a one-copy test resource.
2. Login reader → verify admin 403 → search/details → borrow 201 → verify stock 0 → duplicate 409 → return → verify stock 1.
3. Borrow again → login second reader → reserve/position 1 → original reader returns → verify public stock remains 0 because the copy is held → second reader sees READY and `RESERVATION_READY` notification → collect → return → stock 1.
4. Admin dashboard → analytics → users → borrowings → reservations.
5. With live AI configured, run **02 AI flows — configured provider**: admin imports a chapter excerpt for the actual test Book ID → user semantic search → ask → verify cited chapter/book → eight-week path → recommendations. Atlas may need time after import before this folder's search assertions pass.
6. Run **03 Cleanup** last. It deletes the test book and its AI/saved references. Test user accounts and historical returned loans remain for audit; the disposable fixture database is removed when its server stops.

The existing `biblio.postman_collection.json` remains an endpoint reference. User/admin login requests now capture actual bearer tokens; bearer requests disable cookies so cookie precedence cannot silently change the requested identity. Logout revokes those tokens; log in again after logout. Never manufacture role-only JWTs.

For a credential-free Postman demonstration, start `node backend/test/integration/serve.js`; use `http://127.0.0.1:5005/api/v1`, admin `browser-admin@integration.test`, and the test-only password `Integration-test-42!`. This fixture uses deterministic AI transport and deletes its isolated database on shutdown. It is not evidence of live OpenAI quality.

## 7. Final demo sequence

1. Start the API/UI and sign up a reader. Show profile and interests, then logout/login to demonstrate cookie authentication.
2. In a separate admin browser session, add a one-copy real resource, edit its shelf location, and show the catalogue entry. Index its description/import a licensed excerpt before the AI segment.
3. Reader searches, opens the book, saves it, and borrows. Show availability dropping to zero and My library showing the due date.
4. A second reader reserves it. Show queue position 1. First reader returns; show READY, the in-app notification, and **Collect reserved copy**. Collect and return; availability becomes one.
5. Show `/admin` denied to the reader and the matching API returning 403.
6. Open `/ai`, search “How do robots perceive and navigate?”, then ask for a reading direction. Expand a citation and open its canonical book card. Show an eight-week learning path and saved/interested-resource recommendations. Explain if using the isolated test provider.
7. Admin opens overview, analytics, users and borrowings. Delete a disposable unused book; demonstrate that deleting an active loan's book is rejected.
8. Logout and verify the protected request returns 401.
