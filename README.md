# LibraMind — Books and Catalogue

Books domain implementation on `feature/books`, following [`architecture.md`](./architecture.md).

## Run locally

1. Install dependencies with `npm install` in `backend/` and `frontend/`.
2. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` and `JWT_SECRET`.
3. Run the API with `npm run dev` in `backend/` and the UI with `npm run dev` in `frontend/`.
4. The web client uses `http://localhost:5000/api/v1` by default. Set `VITE_API_URL` to change it.

Book reads and category reads require the shared JWT contract (`token` cookie or Bearer token) and a USER or ADMIN role. Mutations require ADMIN. Auth middleware exports `authenticate` and `authorize(...roles)` from `backend/src/middleware/auth.js`; swap that module for the shared auth team's implementation if the repository adds one.

## API

- `GET /api/v1/books?page=&limit=&search=&category=&sort=&available=`
- `GET /api/v1/books/:id`
- `POST /api/v1/books` (ADMIN)
- `PATCH /api/v1/books/:id` (ADMIN; includes inventory updates)
- `DELETE /api/v1/books/:id` (ADMIN; returns 409 when active borrows/reservations reference the book)
- `GET /api/v1/categories`

Success and error bodies follow the shared `{ success, message, data/errors }` response shape. Books are stored once; other modules reference the MongoDB `_id` as `bookId`/`book`.

Postman collection: [`postman/LibraMind.postman_collection.json`](./postman/LibraMind.postman_collection.json). Set its `token` to a JWT whose claims contain `id`/`sub` and `role`.
