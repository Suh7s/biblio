# LibraMind — Library Management MVP

Books, circulation, admin analytics, and library-grounded AI implementation following [`architecture.md`](./architecture.md). The admin module uses the same `{ success, message, data }` and `{ success: false, message, errors }` response contracts and shared JWT middleware.

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
- `POST /api/v1/borrow/:bookId`, `GET /api/v1/borrow/my`, `PATCH /api/v1/borrow/:id/return`, `PATCH /api/v1/borrow/:id/renew`
- `POST /api/v1/reservations/:bookId`, `GET /api/v1/reservations/my`, `DELETE /api/v1/reservations/:id`
- `GET /api/v1/fines/my`, `GET /api/v1/notifications`, `PATCH /api/v1/notifications/:id/read`

Success and error bodies follow the shared `{ success, message, data/errors }` response shape. Books are stored once; other modules reference the MongoDB `_id` as `bookId`/`book`.

Circulation defaults are a 14 day loan, two renewals, a three day reservation pickup window, and a fine of 1 currency unit per overdue day. Configure `LOAN_DAYS`, `MAX_RENEWALS`, `RESERVATION_HOLD_DAYS`, and `FINE_PER_DAY` to change those values.

Postman collection: [`postman/LibraMind.postman_collection.json`](./postman/LibraMind.postman_collection.json). Set `token` and `userToken` to a JWT whose claims contain `id`/`sub` and `role`, plus `bookId` for a book to exercise the circulation flow. Each circulation request includes a Postman test script. Inventory updates use atomic book increments/decrements and rollback when a loan cannot be created; multi-document transactions are not required by this module.

## Admin API

All admin routes require the shared `authenticate` middleware and `authorize('ADMIN')`:

- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/users?page=&limit=&search=&role=`
- `GET /api/v1/admin/borrowings?page=&limit=&status=&userId=`
- `GET /api/v1/admin/reservations?page=&limit=&status=&bookId=`
- `GET /api/v1/admin/analytics?lowAvailability=`

Dashboard and analytics summaries use MongoDB counts and aggregation pipelines rather than storing derived totals. User listing reads the shared `users` collection and omits password and credential fields. Admin pages are available at `/admin`, `/admin/users`, `/admin/borrowings`, and `/admin/analytics`; `/admin/books` links to the books module.

The shared Postman collection includes integrated Books, Borrowing, Admin, AI, Authentication, and User requests. Authentication uses the shared JWT middleware described below.

## LibraAI (Developer 4)

The `/ai` workspace adds grounded library guidance, semantic search, cited book cards,
learning paths and activity-based recommendations.
See [AI setup](docs/ai-setup.md) for provider/vector-index configuration, indexing and tests,
and [AI contracts](docs/ai-contracts.md) for ownership boundaries and endpoint shapes.

## Authentication and users

JWTs are signed with `JWT_SECRET`, carry the user `id` and `role`, and expire after seven days. Login sets the JWT in the `token` cookie (`HttpOnly`, `SameSite=Lax`, path `/`, `Secure` in production); logout clears it. The API also accepts `Authorization: Bearer <JWT>` for server and Postman integrations. Frontend calls use Axios `withCredentials` and never read the cookie from JavaScript. New registrations always receive the `USER` role; grant `ADMIN` through trusted database/admin provisioning only.

Auth endpoints:

- `POST /api/v1/auth/register` — `{ "name": "Ada Reader", "email": "ada@example.edu", "password": "Reading123!", "interests": ["robotics"] }`
- `POST /api/v1/auth/login` — `{ "email": "ada@example.edu", "password": "Reading123!" }`; sets the cookie.
- `POST /api/v1/auth/logout` — clears the cookie.
- `GET /api/v1/auth/me` — authenticated user.

User endpoints:

- `GET /api/v1/users/me` — authenticated profile.
- `PATCH /api/v1/users/me` — accepts `name` and/or `interests`.
- `GET /api/v1/users/me/history` — the authenticated user's borrowing history (shared `Borrow` records; borrowing logic remains in the circulation module).

Success responses follow `{ "success": true, "message": "...", "data": { "user": { "_id": "...", "name": "...", "email": "...", "role": "USER", "interests": [] } } }`. Password hashes are excluded. Errors follow `{ "success": false, "message": "...", "errors": {} }`; missing/invalid authentication returns 401 and insufficient permissions returns 403.

Middleware usage in Express: `router.get('/admin-only', authenticate, authorize('ADMIN'), handler)`. `authenticate` sets `req.user._id` and `req.user.role`; `authorize` accepts one or more role names, such as `authorize('USER', 'ADMIN')`. Backend checks are authoritative; frontend guards only provide navigation and an access denied page.

The Postman collection includes register, login, authenticated `/auth/me`, logout, profile read/update, and history requests under **Authentication**. Postman retains the login cookie in its cookie jar for subsequent requests.
