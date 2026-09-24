You are the lead software architect for a 5-person student engineering team building **biblio**, a production-oriented intelligent library management platform for a university.

This is not a simple CRUD hackathon project. The goal is to build a clean, scalable MVP that could eventually become the default digital library application for the university.

## PRODUCT VISION

biblio combines:

1. Complete digital library management
2. Student/user accounts
3. Book catalogue and inventory
4. Borrowing, returning, renewing and reservations
5. Fines and overdue management
6. Notifications
7. Semantic search
8. RAG-powered AI library assistant
9. Personalized book recommendations
10. AI-generated learning paths
11. Student reading history and saved books
12. Librarian/admin management
13. Analytics and reporting

Core philosophy:

> Traditional library systems help users find books. biblio helps users discover knowledge.

The system must be designed so that the AI layer is integrated with the actual library database rather than acting as a generic chatbot.

---

# REQUIRED TECHNOLOGY

Frontend:

* React
* Vite
* Tailwind CSS
* React Router
* Axios
* Modern responsive UI

Backend:

* Node.js
* Express.js
* REST API
* MongoDB
* Mongoose

Authentication:

* JWT
* HTTP-only cookies
* bcrypt password hashing
* Protected routes
* Role-based access control
* USER and ADMIN roles

Validation:

* Zod or Joi

AI:

* Embedding model
* Vector/semantic search
* RAG
* LLM API
* Source attribution

Testing:

* Postman

---

# HIGH-LEVEL ARCHITECTURE

Use:

Frontend
↓
REST API
↓
Express backend
↓
Services/controllers
↓
MongoDB

AI:

User query
↓
Embedding
↓
Semantic/vector search
↓
Relevant library documents
↓
RAG context
↓
LLM
↓
Answer + sources

The AI must retrieve information from the library's actual books/book chunks before generating answers.

---

# USER ROLES

Initial roles:

USER
ADMIN

Design the authorization architecture so that additional roles such as LIBRARIAN or SUPER_ADMIN can be introduced later without rewriting the application.

USER capabilities:

* Browse books
* Search books
* Semantic search
* View book details
* Borrow books
* Return books
* Renew books
* Reserve unavailable books
* View borrowing history
* View current loans
* View fines
* Save books
* View recommendations
* Ask biblio AI
* Generate learning paths
* Manage profile

ADMIN capabilities:

* Everything appropriate for management
* Create books
* Update books
* Delete books
* Manage inventory
* Manage users
* Manage borrowing
* Manage reservations
* Manage categories
* View analytics
* Manage AI knowledge sources

---

# DATABASE MODELS

Design around the following core models.

## User

Fields:

* name
* email
* password
* role
* profile/interests where appropriate
* timestamps

Never store plaintext passwords.

## Book

Fields:

* title
* authors
* isbn
* description
* category
* tags
* publisher
* publicationYear
* totalCopies
* availableCopies
* shelfLocation
* coverImage
* timestamps

## Borrow

Fields:

* user
* book
* borrowedAt
* dueDate
* returnedAt
* renewedCount
* status

Statuses should support:
BORROWED
RETURNED
OVERDUE

## Reservation

Fields:

* user
* book
* queue position
* createdAt
* status
* expiration information where appropriate

## BookChunk

Used for RAG.

Fields:

* book
* chapter
* section
* content
* embedding
* metadata

## Fine

Fields:

* user
* borrow
* amount
* reason
* status
* createdAt
* paidAt

## Notification

Fields:

* user
* type
* title
* message
* read
* metadata
* createdAt

## SearchHistory

Fields:

* user
* query
* searchType
* results
* createdAt

## SavedBook

Fields:

* user
* book
* createdAt

Do not unnecessarily create duplicate models.

---

# API STRUCTURE

Use versioned REST endpoints where appropriate.

Base:

/api/v1

Authentication:

POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /auth/me

Users:

GET    /users/me
PATCH  /users/me
GET    /users/me/history

Books:

GET    /books
GET    /books/:id
POST   /books
PATCH  /books/:id
DELETE /books/:id

Borrowing:

POST   /borrow/:bookId
GET    /borrow/my
PATCH  /borrow/:id/return
PATCH  /borrow/:id/renew

Reservations:

POST   /reservations/:bookId
GET    /reservations/my
DELETE /reservations/:id

Fines:

GET    /fines/my

Notifications:

GET    /notifications
PATCH  /notifications/:id/read

AI:

GET    /ai/search
POST   /ai/ask
POST   /ai/learning-path

Admin:

GET    /admin/dashboard
GET    /admin/users
GET    /admin/borrowings
GET    /admin/reservations
GET    /admin/analytics

The exact endpoint structure may be refined, but all team members must agree on API contracts before implementation.

---

# AUTHENTICATION

Login must:

1. Validate credentials
2. Find user
3. Compare password using bcrypt
4. Generate JWT
5. Store JWT in an HTTP-only cookie
6. Never expose the JWT to frontend JavaScript unnecessarily

Authentication middleware must:

1. Read JWT from cookie
2. Verify JWT
3. Identify user
4. Attach user information to req.user
5. Reject invalid/expired tokens

Authorization middleware must support:

authorize("ADMIN")

Unauthorized users:
401

Authenticated users without permission:
403

---

# VALIDATION

Every important request must be validated before reaching business logic.

Validate:

* registration
* login
* book creation
* book updates
* borrowing
* reservations
* profile updates
* AI requests

Return consistent validation errors.

---

# ERROR HANDLING

Use centralized error handling.

Do not duplicate try/catch response logic across every controller.

Use a consistent response structure:

Success:

{
"success": true,
"message": "...",
"data": {}
}

Error:

{
"success": false,
"message": "...",
"errors": {}
}

Handle:

* validation errors
* authentication errors
* authorization errors
* resource not found
* duplicate resources
* database errors
* unexpected server errors

---

# BOOK BUSINESS LOGIC

Borrowing a book must:

1. Authenticate user
2. Find book
3. Check availability
4. Prevent duplicate active borrowing
5. Create Borrow record
6. Decrease availableCopies
7. Calculate dueDate
8. Create notification
9. Return consistent response

Returning a book must:

1. Verify ownership
2. Update Borrow
3. Increase availableCopies
4. Calculate fine if overdue
5. Update reservation queue if applicable
6. Notify next reservation holder where appropriate

Reservation must:

1. Check whether book exists
2. Check whether user already has an active reservation
3. Add user to queue
4. Return queue position

Use transactions where multiple database operations must remain consistent.

---

# SEMANTIC SEARCH

Semantic search must allow natural-language queries.

Example:

"I want books that explain how robots perceive and navigate their environment."

The system should retrieve conceptually relevant resources even when the exact query words do not occur in the book metadata.

Pipeline:

query
→ embedding
→ vector search
→ ranked results
→ book metadata
→ response

Expose semantic search through the API.

The response should include:

* book
* relevance information where useful
* reason for relevance
* availability

---

# RAG

biblio AI must be library-aware.

Example:

User:
"I know Python and calculus and want to learn robotics. What should I read?"

Pipeline:

User question
→ embedding
→ retrieve relevant BookChunks
→ construct context
→ LLM
→ answer
→ source citations

The LLM must be instructed to:

* use retrieved library context
* avoid inventing books
* clearly state when information is unavailable
* cite retrieved sources
* distinguish library facts from generated recommendations

Example response:

{
"answer": "...",
"sources": [
{
"book": "Modern Robotics",
"chapter": "Chapter 3"
}
]
}

---

# AI FEATURES

Implement:

1. Semantic book search
2. Ask biblio AI
3. Book explanation
4. Prerequisite explanation
5. Related-resource discovery
6. Personalized recommendations
7. AI learning paths

Learning path example:

User:
"I have 8 weeks to learn robotics."

The system retrieves available library resources and creates:

Week 1-2:
Resource A

Week 3-4:
Resource B

Week 5-6:
Resource C

Week 7-8:
Resource D

Recommendations must be grounded in actual library resources.

---

# FRONTEND

Build a modern, responsive university product rather than an old-fashioned library portal.

Pages:

* Landing/Login
* Register
* Student Dashboard
* Catalogue
* Search Results
* Book Details
* My Library
* Reservations
* Fines
* Notifications
* Saved Books
* AI Assistant
* Learning Path
* Profile
* Admin Dashboard
* Admin Books
* Admin Users
* Admin Borrowings
* Analytics

Use reusable components.

Examples:

Navbar
Sidebar
BookCard
SearchBar
BookGrid
StatusBadge
Modal
Toast
LoadingState
ErrorState
EmptyState
Pagination
AIChat
SourceCitation
AnalyticsCard

---

# FRONTEND/BACKEND CONTRACT

The frontend must communicate with the backend only through documented REST APIs.

Do not couple frontend components directly to MongoDB.

Use Axios or a centralized API client.

Centralize:

* base URL
* credentials
* error handling
* authentication behavior

The backend remains the source of truth for:

* authentication
* authorization
* book availability
* borrowing state
* reservations
* fines

---

# GIT / COLLABORATION

Five developers work simultaneously.

Use:

main
develop

Feature branches:

feature/auth
feature/books
feature/borrowing
feature/ai
feature/admin

Never directly develop on main.

Each developer owns both backend and frontend for their domain.

Developer 1:
Auth + Users + Login/Profile

Developer 2:
Books + Catalogue

Developer 3:
Borrowing + Reservations + Fines + Notifications

Developer 4:
Semantic Search + RAG + AI

Developer 5:
Admin + Analytics + Integration

All developers must follow shared:

* API contracts
* database schema
* response format
* error format
* authentication middleware
* coding conventions

---

# POSTMAN

Create a shared Postman collection:

BIBLIO API

Folders:

* Authentication
* Users
* Books
* Borrowing
* Reservations
* Fines
* Notifications
* AI
* Admin

Include successful and failure cases.

Demonstrate:

* successful registration
* successful login
* protected endpoint
* unauthorized request
* USER attempting ADMIN operation
* ADMIN successfully performing operation
* book CRUD
* borrow
* return
* reservation
* semantic search
* RAG query

---

# SECURITY

Implement reasonable production-oriented security:

* bcrypt
* HTTP-only cookies
* JWT expiry
* input validation
* role checks
* environment variables
* no secrets committed to Git
* appropriate CORS configuration
* secure cookie configuration in production
* avoid exposing sensitive user information
* sanitize/validate user-controlled data

---

# SCALABILITY

Design the system so future versions can support:

* multiple library branches
* e-books
* research papers
* journals
* theses
* project reports
* digital resources
* multiple universities
* librarian role
* super-admin
* email notifications
* push notifications
* advanced recommendation systems
* multilingual support

Do not hard-code university-specific business rules into the core architecture.

---

# DESIGN PRINCIPLE

Prioritize:

1. Correctness
2. Security
3. Clean architecture
4. Clear API contracts
5. Maintainability
6. User experience
7. AI usefulness

Do not add complexity simply to make the architecture look sophisticated.

Every feature should have a clear purpose.

The final system should feel like a real product that could be maintained after the hackathon, not a collection of disconnected demo features.

Before implementing anything, identify dependencies between modules and clearly define the contracts required for independent development.
