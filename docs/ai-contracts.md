# Developer 4: integration contracts

Based on `architecture.md` and Developer 2's `feature/books` commit 927c048.
The AI module is integrated with the books, circulation, and admin modules on
`main`. Shared route registration, navigation, environment settings, and Postman
requests preserve each owner’s features.

## Ownership and dependencies

| Owner | AI consumes | Contract |
| --- | --- | --- |
| Developer 1 | Authentication | `authenticate`, `authorize(...roles)` from `middleware/auth.js`; `req.user = { id, role }`; MongoDB ObjectId identity; HTTP-only `token` cookie |
| Developer 1 | User preferences, saved books | `users`: `_id`, `interests` or `profile.interests` string array; `savedbooks`: `user`, `book`, `createdAt` |
| Developer 2 | Catalogue | Existing `models/Book.js`; immutable `_id`, title, authors, description, category, tags, inventory and metadata. AI never writes Book records. `/books/:id` is the frontend detail route. |
| Developer 3 | Borrowing | `borrows`: `user`, `book`, `borrowedAt`, status in BORROWED/RETURNED/OVERDUE. AI only reads the authenticated user's bounded recent history. |
| Developer 4 | AI knowledge/history | `BookChunk`, `SearchHistory`, AI services, `/api/v1/ai`, `/ai` |
| Developer 5 | Integration | Register the AI router before shared 404/error handlers; register `/ai` in the shared frontend router. |

User/borrowing models are not duplicated. The read-only activity adapter isolates
these collection contracts for replacement with the owners' services when they
land. An absent user/activity record yields a cold-start response, not fake data.
SearchHistory uses the master schema and registers only once; other modules should
reuse its model. Search results are Book ObjectId references, not copied books.

## Public API

All endpoints require USER/ADMIN authentication and return the master
`{ success, message, data }` / `{ success: false, message, errors? }` envelope.
AI routes limit requests per authenticated identity; generation/provider failures
are sanitized. All inputs are validated before embedding/database work.

- `GET /api/v1/ai/search?q=...&limit=8&availableOnly=false`
- `POST /api/v1/ai/ask` — `{ query, contextBookIds?: [BookId] }`. Context IDs are optional follow-up anchors; the server re-retrieves their actual chunks.
- `POST /api/v1/ai/learning-path` — `{ goal, durationWeeks: 1..52, background?: string }`
- `GET /api/v1/ai/recommendations?limit=6`
- `PUT /api/v1/ai/books/:bookId/chunks` (ADMIN) — replace one source atomically: `{ sourceId, sections: [{ chapter?, section?, content, pageStart? }] }`
- `POST /api/v1/ai/books/:bookId/index` (ADMIN) — idempotently embed current catalogue metadata/description.
- `DELETE /api/v1/ai/books/:bookId/chunks/:sourceId` (ADMIN) — remove one source.

Search results: `{ book: Book, relevance: number, reason: string, sources: Source[] }`.
Scores are normalized cosine similarity in [0,1], **not probability/confidence**.
Source: `{ id, book: title, bookId, chapter, section, excerpt, sourceType, pageStart }`.
Ask: `{ answer, sources, books: Book[], insufficientContext }`.
Learning path: `{ goal, durationWeeks, background, summary, steps: [{ startWeek,
endWeek, book: Book, source: Source, focus, activities: string[] }], sources,
insufficientContext }`. Week ranges cover the requested duration without gaps.
Recommendations: `{ results, strategy, signalsUsed }`; cold start requests interests
or activity and returns an empty result. Recommendations are suggestions, never a
claim that a book is a prerequisite, enrolled course, or guaranteed learning outcome.

## Grounding boundary

The LLM returns only retrieved source IDs, verbatim excerpts and one of a small set
of recommendation roles. It cannot author titles, IDs, availability, links or free
form library claims. The server validates every selection, verifies excerpts are
contained in the retrieved text, re-reads selected Book records after generation,
and constructs the answer/cards/citations itself. Invalid output fails closed.
Catalogue descriptions are explicitly labelled as descriptions, never chapters.
Empty or low-relevance context never calls the LLM. Availability reflects the
server read time; the borrowing API makes the final decision.

Extracted source text is untrusted data, not instructions. The system prompt
explicitly prohibits invented books/availability, demands attribution and requires
abstention when context is insufficient. This constrained MVP intentionally prefers
short, sourced reading guidance to unrestricted chatbot prose.
