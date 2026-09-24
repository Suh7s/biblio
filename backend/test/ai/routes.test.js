import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import request from "supertest";
import { rateLimit } from "express-rate-limit";
import { createAiRouter } from "../../src/routes/ai.js";
import { errorHandler } from "../../src/middleware/errors.js";
import { ids } from "./fixtures.js";
process.env.JWT_SECRET = "test-only-auth-secret";
const token = (role = "USER") =>
  jwt.sign({ sub: ids.user, role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
function app(overrides = {}) {
  const calls = [];
  const service = Object.fromEntries(
    ["search", "ask", "learningPath", "recommendations"].map((name) => [
      name,
      async (...args) => {
        calls.push({ name, args });
        return { results: [] };
      },
    ]),
  );
  const indexer = {
    async indexCatalogue() {
      return { indexed: true };
    },
    async replaceSource() {
      return { chunks: 2 };
    },
    async deleteSource() {
      return { deletedCount: 2 };
    },
  };
  const application = express();
  application.use(express.json(), cookieParser());
  application.use(
    "/api/v1/ai",
    createAiRouter({
      service,
      indexer,
      limiter: (req, res, next) => next(),
      ...overrides,
    }),
  );
  application.use(errorHandler);
  return { app: application, calls };
}
test("AI routes require authenticated users and reject unsupported roles", async () => {
  const { app: server } = app();
  for (const [method, path] of [
    ["get", "/search?q=robotics"],
    ["post", "/ask"],
    ["post", "/learning-path"],
    ["get", "/recommendations"],
  ]) {
    assert.equal(
      (await request(server)[method](`/api/v1/ai${path}`)).status,
      401,
    );
  }
  assert.equal(
    (
      await request(server)
        .get("/api/v1/ai/search?q=robotics")
        .auth(token("OTHER"), { type: "bearer" })
    ).status,
    403,
  );
});
test("cookie identity is used and response envelope/cache rules match shared contracts", async () => {
  const { app: server, calls } = app();
  const result = await request(server)
    .get("/api/v1/ai/search?q=robotics")
    .set("Cookie", `token=${token()}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.ok(result.body.message);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(calls[0].args[1], ids.user);
  assert.equal(calls[0].args[0].limit, 8);
});
test("validation rejects malformed queries, unbounded limits, durations and spoofed identity before service calls", async () => {
  const { app: server, calls } = app();
  for (const path of [
    "/search",
    "/search?q=x",
    "/search?q=robotics&limit=200",
    "/search?q[]=one&q[]=two",
    "/search?q=robotics&availableOnly=1",
    "/recommendations?userId=other",
  ]) {
    const result = await request(server)
      .get(`/api/v1/ai${path}`)
      .auth(token(), { type: "bearer" });
    assert.equal(result.status, 400, path);
  }
  for (const body of [
    { goal: "Learn robotics", durationWeeks: 0 },
    { goal: "Learn robotics", durationWeeks: 53 },
    { goal: "Learn robotics", durationWeeks: 2.5 },
    { goal: "Learn robotics", durationWeeks: "8" },
  ]) {
    assert.equal(
      (
        await request(server)
          .post("/api/v1/ai/learning-path")
          .auth(token(), { type: "bearer" })
          .send(body)
      ).status,
      400,
    );
  }
  for (const body of [
    { query: " " },
    { query: "hello", userId: ids.user },
    { query: "hello", contextBookIds: ["bad"] },
  ]) {
    assert.equal(
      (
        await request(server)
          .post("/api/v1/ai/ask")
          .auth(token(), { type: "bearer" })
          .send(body)
      ).status,
      400,
    );
  }
  assert.equal(calls.length, 0);
});
test("source management is ADMIN-only and validates IDs and content", async () => {
  const { app: server } = app();
  const path = `/api/v1/ai/books/${ids.book}`;
  assert.equal(
    (
      await request(server)
        .post(`${path}/index`)
        .auth(token(), { type: "bearer" })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(server)
        .post(`${path}/index`)
        .auth(token("ADMIN"), { type: "bearer" })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(server)
        .post("/api/v1/ai/books/invalid/index")
        .auth(token("ADMIN"), { type: "bearer" })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(server)
        .put(`${path}/chunks`)
        .auth(token("ADMIN"), { type: "bearer" })
        .send({ sourceId: "catalogue", sections: [] })
    ).status,
    400,
  );
});
test("authenticated rate limit produces 429 before additional paid requests", async () => {
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 1,
    keyGenerator: (req) => req.user.id,
    message: { success: false, message: "Too many AI requests." },
  });
  const { app: server, calls } = app({ limiter });
  assert.equal(
    (
      await request(server)
        .get("/api/v1/ai/search?q=robotics")
        .auth(token(), { type: "bearer" })
    ).status,
    200,
  );
  const result = await request(server)
    .get("/api/v1/ai/search?q=robotics")
    .auth(token(), { type: "bearer" });
  assert.equal(result.status, 429);
  assert.equal(result.body.success, false);
  assert.equal(calls.length, 1);
});
test("provider failures use the shared sanitized error handler", async () => {
  const { app: server } = app({
    service: {
      async ask() {
        throw Object.assign(new Error("AI is not configured yet."), {
          status: 503,
        });
      },
    },
  });
  const result = await request(server)
    .post("/api/v1/ai/ask")
    .auth(token(), { type: "bearer" })
    .send({ query: "Learn robotics" });
  assert.equal(result.status, 503);
  assert.equal(result.body.success, false);
});
