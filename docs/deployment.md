# Department deployment

This guide prepares biblio for a controlled deployment. It does not certify the application as institution-ready: campus identity integration, privacy/retention approval, a restore-tested database backup, and an infrastructure security review are required before real student records are used.

## Deployment layout

The provided Compose file runs a non-root Node API and a non-root Nginx frontend. Nginx serves the single-page app and forwards `/api/*` to the API. Only the frontend port is published, bound to `127.0.0.1:8080`; an institutional TLS reverse proxy must be the only component that exposes the service to users. MongoDB is external and is not included in Compose. Use a managed MongoDB deployment with TLS, network allowlisting, a least-privilege application account, and automated backups.

## Configure and start

1. Install Docker Engine/Compose on the department host and prepare a managed MongoDB replica set or Atlas cluster. Inventory operations require transactions. Configure and verify the Atlas vector index described in [AI setup](ai-setup.md).
2. Copy `.env.production.example` to `.env.production`. Put real values in it, restrict the file to the service operator (`chmod 600 .env.production`), and keep it out of source control and image build contexts.
3. Generate a secret with `openssl rand -hex 32`. Use a dedicated MongoDB account, the exact public HTTPS origin with no trailing slash, and a server-side provider key. The example `TRUST_PROXY_HOPS=2` assumes an outer institutional TLS proxy in front of the Nginx container. Configure the edge proxy to overwrite untrusted `X-Forwarded-*` headers and ensure the published frontend port is unreachable from the public network. Set the hop count to the actual trusted topology; do not trust arbitrary client-supplied forwarding headers.
4. Build and start:

   ```sh
   docker compose --env-file .env.production -f docker-compose.production.yml config
   docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
   docker compose --env-file .env.production -f docker-compose.production.yml ps
   ```

5. Configure the institutional TLS proxy to forward HTTPS traffic to `127.0.0.1:8080`, preserving the public `Host`, `X-Forwarded-Proto`, and verified client `X-Forwarded-For` chain. Confirm `/health/live` and `/health/ready` return 200 through the public HTTPS origin. Readiness exposes only `ok` or `unavailable`; it does not reveal database details.
6. Create the first administrator only after the identity/bootstrap process has been approved. The current application still has password registration and no email verification or campus SSO. Do not interpret an email-domain allowlist as proof of identity. For department-wide access, configure the university's OIDC/SAML identity provider before launch.
7. Back up and test restoring the database before importing real users, loans, or library records. Record who owns incident response, account revocation, retention, and deletion requests.

Useful commands:

```sh
# Follow service logs; do not enable request-body or credential logging.
docker compose --env-file .env.production -f docker-compose.production.yml logs -f api frontend

# Stop without deleting data (MongoDB is external).
docker compose --env-file .env.production -f docker-compose.production.yml down
```

## Security controls in this release

- Passwords are bcrypt-hashed (cost 12), excluded from normal model reads, and never returned in public user objects.
- Authentication uses `HttpOnly`, `SameSite=Lax` cookies; production cookies are `Secure`. Logout revokes existing sessions.
- Roles are loaded from the current user record, not trusted from client-supplied or stale role claims.
- Production startup rejects a non-HTTPS public origin, an unconfigured trusted proxy, non-TLS MongoDB, missing/placeholder AI credentials, and exact-scan AI mode.
- Helmet security headers are applied to API responses. The Nginx frontend adds a restrictive content policy, frame denial, and HSTS.
- The frontend loads its current typography from Google Fonts; the content policy allows only the Google Fonts stylesheet and font hosts for that purpose. Include that third-party request in the university privacy review or self-host the font files if policy requires it.
- Liveness and database readiness are separate. Shutdown marks the API unready, drains requests, and disconnects MongoDB.
- Auth and AI endpoints are rate-limited per process. This is suitable only for a single API instance; horizontal scaling requires a shared rate-limit store and a reviewed proxy/IP strategy.

## Launch blockers and operational work

The code and Compose example are a starting point, not a security certification. Resolve these before a departmental launch:

- Integrate campus OIDC/SAML or an approved verified-invitation workflow. Public password registration alone can't establish that an account belongs to a student or staff member.
- Have the university security/privacy team review borrowing-history sensitivity, data minimization, retention/deletion, provider data-processing terms, and incident response.
- Set up database point-in-time recovery, test a restore, monitor API/readiness/provider failures, and document on-call ownership.
- Add a shared rate-limit store before running multiple API replicas. Keep this Compose API at one replica until then.
- Pin base images to reviewed digests, scan built images, and schedule dependency/image updates before publishing a production release.
- Run the release smoke test with the university IdP, actual proxy topology, TLS certificate, Atlas index, real licensed source material, and a restored backup.

Do not put provider keys in `VITE_*` variables, browser bundles, Git, issue reports, or Postman exports.
