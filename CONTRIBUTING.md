# Contributing to biblio

Thanks for helping improve biblio. Keep changes focused, protect library and account data, and build on the existing React, Express, and MongoDB architecture.

## Local setup

Follow the [README setup guide](README.md#get-started), then run both development servers from the repository root:

```sh
npm run dev:api
npm run dev:web
```

The API needs MongoDB Atlas or a local replica set because circulation uses transactions. AI calls need a server-side `OPENAI_API_KEY`; automated tests use isolated databases and deterministic provider responses.

## Where code belongs

- `frontend/src/` contains React pages and shared components.
- `backend/src/` contains versioned Express routes, models, and services.
- `docs/` contains setup, API contracts, and operational guidance.
- `postman/` contains importable API request collections.

Books have one canonical record. Borrowing, reservations, saved lists, and AI sources refer to its ID. AI answers must stay grounded in retrieved library context, and availability must come from the catalogue.

## Before opening a pull request

Run checks that cover the changed area:

```sh
npm test --prefix backend
npm run build --prefix frontend
npm run test:ai --prefix frontend
npm run test:integration --prefix frontend
```

The browser integration suite starts its own disposable MongoDB replica set and local API. Do not point it at a live library. The AI tests do not call OpenAI or verify Atlas vector-index setup; consult the [AI setup guide](docs/ai-setup.md) for those checks.

For visual changes, review both desktop and mobile layouts. For API changes, keep the [integration guide](docs/integration.md) and the relevant Postman collections current. Never include `.env` files, provider keys, real member records, or borrowed-book data in a pull request.
