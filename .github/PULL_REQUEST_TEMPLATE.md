## What changed

<!-- Describe the user-visible or operational change. -->

## Why

<!-- Link the issue or explain the need. -->

## Checks

- [ ] `npm test --prefix backend` (if backend code changed)
- [ ] `npm run build --prefix frontend` (if frontend code changed)
- [ ] `npm run test:ai --prefix frontend` (if user interface changed)
- [ ] `npm run test:integration --prefix frontend` (if an end-to-end flow changed)
- [ ] Documentation and environment examples match the change
- [ ] No secrets, user data, or generated test files included
