# LibraAI setup and verification

This is Developer 4's module on `feature/ai`, built on the existing
`feature/books` scaffold. See [contracts](ai-contracts.md) before integration.
Node.js 22 or later is recommended. The AI module uses the existing Express,
Mongoose, React, Router and Axios architecture. Tailwind utilities have an `ai-`
prefix and no preflight so catalogue styles remain intact.

## Configure and run

```sh
npm ci --prefix backend
npm ci --prefix frontend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set the following **server-side** in `backend/.env`:

- `MONGODB_URI`: MongoDB Atlas or a local MongoDB **replica set**. Chunk replacement
  uses transactions; a standalone MongoDB server cannot perform indexing.
- `JWT_SECRET`: the same secret as Developer 1's auth service.
- `OPENAI_API_KEY`: an API key with embedding and Responses API access.
- `AI_VECTOR_MODE=atlas` for production, or `exact` for bounded local testing.
- `CLIENT_ORIGIN`: the frontend origin, default `http://localhost:5173`.

Defaults: `text-embedding-3-small`, 1536 dimensions, `gpt-4o-mini` for structured
source selection. These are configurable model choices, not a claim about the
latest model. Changing embedding model/dimensions requires reindexing **all**
sources; differently configured embeddings are filtered out of retrieval.
Do not place provider keys in frontend variables.

```sh
npm run dev:api
npm run dev:web
```

Visit `/ai`. Sign in through Developer 1's shared authentication flow. The source
branch currently contains the shared JWT middleware but no login implementation;
this module does not add a competing authentication system. Postman accepts a
valid shared JWT. Browser requests use the existing HTTP-only cookie contract.
No books, mock embeddings, fake availability or example answers are shipped into
the runtime app. Add actual catalogue records through Developer 2's APIs/UI.

## Index library resources

For Atlas, create the separate vector index on the **bookchunks** collection:

```sh
cd backend
npm run ai:create-vector-index
npm run ai:index
```

The first command uses the configured dimensions and filter fields; the static
`backend/atlas-vector-index.json` is an equivalent default Atlas definition.
Wait for the index to be queryable in Atlas. A normal Mongoose B-tree index does
not enable `$vectorSearch`. Existing index definitions are not overwritten.
Check their dimensions/filter fields manually when configuration changes.

`ai:index` embeds real title/author/category/tag/description content and skips
unchanged records. It does not manufacture chapter text. It must be run after
catalogue content updates (or call `POST /ai/books/:bookId/index` from Developer
2's post-write integration). Inventory-only updates do not require reembedding.
Until reindexed, stale catalogue chunks are excluded using content fingerprints.
Chunks for deleted books are ignored at hydration time; maintenance may delete
those orphans later. No hooks mutate the Book owner's model.

Licensed excerpts can be uploaded by ADMIN through:

```http
PUT /api/v1/ai/books/<existing-book-id>/chunks
Content-Type: application/json

{
  "sourceId": "course-notes-v1",
  "sections": [
    {
      "chapter": "Chapter 2",
      "section": "Coordinate frames",
      "content": "Supply the actual source text here, not generated book content.",
      "pageStart": 12
    }
  ]
}
```

Replacing a source preserves other sources for that Book ID. Embeddings are
computed before a transaction replaces the source, so provider failures preserve
the previous data. Resubmitting replaces that source instead of duplicating it.
Only upload source text the library is allowed to process. Source text and query
text are sent to the embedding/LLM provider. Passwords, borrowing records and raw
user profiles are not sent; recommendation queries use selected topic/title
signals. Search history is retained for 90 days by a MongoDB TTL index.

## Retrieval and answer behavior

1. Validate bounded input and authenticate with the existing shared middleware.
2. Embed the query with the configured embedding model.
3. Query compatible vectors, with model/dimension filters and optional Book IDs.
4. Hydrate real books, filter stale/deleted/low-score context and cap context size.
5. Ask the LLM to select cited excerpts/reading roles using a strict JSON schema.
6. Reject unknown source IDs, unverifiable quotes, duplicated books and extra claims.
7. Re-read selected books/chunk IDs and render authoritative answers and links.

No context returns an explicit insufficient-information response without an LLM
call. Provider outage/missing credentials returns 502/503, not fake results.
Atlas failure never silently switches to keyword matching. Exact mode computes
normalized cosine similarity over at most `AI_EXACT_MAX_CHUNKS` matching chunks;
it rejects overflow rather than silently searching an arbitrary subset.
`AI_MIN_RELEVANCE` defaults to 0.65 (normalized cosine); tune on representative
queries and your library's corpus. Similarity is not answer confidence.

The constrained answer format deliberately limits prose to verified quotations
and source-grounded reading suggestions. It is a reading guide, not an unrestricted
chatbot or a claim that a resource proves a complete prerequisite sequence.
Learning paths divide 1–52 weeks between selected actual books. Schedules are
suggestions. With sparse evidence, fewer resources span longer intervals.
Follow-ups may send previous Book IDs; the server re-retrieves current context.

The first recommendation strategy combines interests, saved/borrowed book topics
and recent searches into an embedding query and excludes already saved/borrowed
books. The activity adapter is the replacement point for future weighting,
collaborative filtering or Developer 1/3 service APIs. No activity returns an
explicit cold start. The per-user rate limiter is an in-process MVP store; use a
shared limiter store before scaling the API to multiple instances.

## Verification

```sh
npm run test:ai --prefix backend
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm run test:ai
```

To use an installed Chrome instead: `PLAYWRIGHT_CHANNEL=chrome npm run test:ai`.
Backend tests download a temporary MongoDB binary on first run and start an
isolated replica set. They use deterministic provider test doubles, never a paid
live model. Browser tests mock only API responses and cover desktop/mobile
interaction, source/book links, availability, error/retry, loading/cancellation,
follow-ups, learning paths, cold start and untrusted text rendering.

The CI workflow runs the same backend tests, frontend build and browser suite.
The shared Postman collection has an AI folder with success and failure cases.
Use `userToken`/`adminToken`, a real `bookId`, and valid AI configuration. Missing
context may legitimately return `insufficientContext=true`.

A real-key/Atlas smoke test is still required before deployment: index real
resources, run a conceptually phrased query (e.g. “robots perceive and navigate”),
inspect the retrieved citations, and verify an unrelated query abstains. Local
exact-mode and mocked-provider tests cannot establish live embedding relevance,
LLM selection quality or Atlas provisioning.

## Primary implementation references

- [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [MongoDB Vector Search](https://www.mongodb.com/docs/vector-search/)
