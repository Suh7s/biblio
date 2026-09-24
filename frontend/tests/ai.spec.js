import { test, expect } from "@playwright/test";

// Fixtures are isolated browser-test API responses, never production/demo catalogue data.
const book = {
  _id: "111111111111111111111111",
  title: "Robotics Test Resource",
  authors: ["Test Author"],
  category: "Engineering",
  availableCopies: 0,
  totalCopies: 2,
};
const source = {
  id: "S1",
  book: book.title,
  bookId: book._id,
  chapter: "Chapter 2",
  section: "Motion planning",
  excerpt: "Coordinate frames describe robot position and orientation.",
  sourceType: "excerpt",
  pageStart: 12,
};
const answer = {
  answer:
    "Suggested foundation: Robotics Test Resource [S1]\nThe source describes coordinate frames.",
  books: [book],
  sources: [source],
  insufficientContext: false,
};
const result = {
  book,
  relevance: 0.94,
  reason: "The source covers coordinate frames and motion planning.",
  sources: [source],
};
const success = (data) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ success: true, message: "Completed.", data }),
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill(success({
      user: {
        _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Test Reader",
        email: "reader@example.edu",
        role: "USER",
        interests: [],
      },
    })),
  );
});
async function noOverflow(page) {
  const width = page.viewportSize().width;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
}

test("assistant welcome is accessible and fits desktop/mobile with no invented books", async ({
  page,
}) => {
  await page.goto("/ai");
  await expect(
    page.getByRole("heading", { name: "Ask LibraAI", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send question" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Find my starting point/ }),
  ).toBeVisible();
  await expect(page.locator(".ai-resource")).toHaveCount(0);
  await noOverflow(page);
});
test("chat resolves book cards, unavailable inventory and expandable chapter citations", async ({
  page,
}) => {
  await page.route("**/api/v1/ai/ask", (route) =>
    route.fulfill(success(answer)),
  );
  await page.goto("/ai");
  await page.getByRole("button", { name: /Find my starting point/ }).click();
  await expect(
    page.getByText("Currently unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ai-resource")).toHaveAttribute(
    "href",
    `/books/${book._id}`,
  );
  await page.locator(".ai-citation summary").click();
  await expect(page.getByRole("blockquote")).toHaveText(source.excerpt);
  await expect(
    page.getByText("Chapter 2 · Motion planning · p. 12"),
  ).toBeVisible();
  await noOverflow(page);
});
test("follow-up sends only book IDs and keeps previous conversation after tool navigation", async ({
  page,
}) => {
  const bodies = [];
  await page.route("**/api/v1/ai/ask", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(success(answer));
  });
  await page.goto("/ai");
  await page
    .getByLabel("Ask LibraAI", { exact: true })
    .fill("Help me learn robotics");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Learning path", exact: true })
    .click();
  await page.getByRole("button", { name: "Ask LibraAI", exact: true }).click();
  await expect(page.locator(".ai-answer")).toHaveCount(1);
  await page
    .getByLabel("Focus this question on the previous answer’s books")
    .check();
  await page
    .getByLabel("Ask LibraAI", { exact: true })
    .fill("Which concepts should I read first?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".ai-answer")).toHaveCount(2);
  expect(bodies[1].contextBookIds).toEqual([book._id]);
  expect(Object.keys(bodies[1]).sort()).toEqual(["contextBookIds", "query"]);
});
test("search handles direct links, explains results and sends availability filtering", async ({
  page,
}) => {
  const urls = [];
  await page.route("**/api/v1/ai/search?**", (route) => {
    urls.push(route.request().url());
    return route.fulfill(
      success({ query: "How robots perceive and navigate", results: [result] }),
    );
  });
  await page.goto("/ai?mode=search&q=How%20robots%20perceive%20and%20navigate");
  await expect(page.locator(".ai-resource h3")).toHaveText(book.title);
  await expect(page.getByText("Why this resource")).toBeVisible();
  await expect(page.getByText(/Similarity 94%/)).toBeVisible();
  await page.getByLabel("Only books with copies available").check();
  await page
    .getByRole("button", { name: "Find resources", exact: true })
    .click();
  await expect
    .poll(() => urls.some((url) => url.includes("availableOnly=true")))
    .toBe(true);
  await noOverflow(page);
});
test("search error allows retry and then an honest empty result", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/ai/search?**", (route) =>
    route.fulfill(
      ++requests === 1
        ? {
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              message: "Vector search unavailable.",
            }),
          }
        : success({ query: "robotics", results: [] }),
    ),
  );
  await page.goto("/ai?mode=search");
  await page.getByLabel("WHAT ARE YOU LOOKING TO LEARN?").fill("robotics");
  await page
    .getByRole("button", { name: "Find resources", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Vector search unavailable.",
  );
  await page.getByRole("button", { name: "Retry", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "No close matches yet" }),
  ).toBeVisible();
});
test("learning path uses structured weeks, real book links and citations", async ({
  page,
}) => {
  let body;
  await page.route("**/api/v1/ai/learning-path", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill(
      success({
        goal: body.goal,
        durationWeeks: body.durationWeeks,
        background: body.background,
        summary: "A suggested schedule using library resources.",
        insufficientContext: false,
        sources: [source],
        steps: [
          {
            startWeek: 1,
            endWeek: 8,
            book,
            source,
            focus: "Suggested foundation",
            activities: [
              "Read the cited section.",
              "Practice a small example.",
            ],
          },
        ],
      }),
    );
  });
  await page.goto("/ai?mode=path");
  await page.getByLabel("Your learning goal").fill("Learn robotics");
  await page.getByLabel("What you already know").fill("Python and calculus");
  await page.getByRole("button", { name: "Build my learning path" }).click();
  await expect(page.getByText("WEEKS 1–8")).toBeVisible();
  await expect(page.locator(".ai-timeline .ai-resource")).toHaveAttribute(
    "href",
    `/books/${book._id}`,
  );
  expect(body.durationWeeks).toBe(8);
  expect(body.background).toBe("Python and calculus");
  await noOverflow(page);
});
test("missing authentication is clear and cold-start recommendations never invent activity", async ({
  page,
}) => {
  await page.route("**/api/v1/ai/ask", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ success: false }),
    }),
  );
  await page.route("**/api/v1/ai/recommendations?**", (route) =>
    route.fulfill(
      success({
        results: [],
        strategy: "cold-start",
        message: "Add interests, save a book, or search the catalogue.",
      }),
    ),
  );
  await page.goto("/ai");
  await page.getByRole("button", { name: /Find my starting point/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.goto("/ai");
  await page.getByRole("button", { name: "For you", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Start with a little curiosity" }),
  ).toBeVisible();
  await expect(page.locator(".ai-resource")).toHaveCount(0);
});
test("reset cancels in-flight answers and untrusted content renders as text", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/ai/ask", async (route) => {
    await gate;
    await route
      .fulfill(
        success({
          ...answer,
          answer: "<img src=x onerror=alert(1)> untrusted text",
        }),
      )
      .catch(() => {});
  });
  await page.goto("/ai");
  await page.getByRole("button", { name: /Find my starting point/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Reading relevant library sources",
  );
  await page.getByRole("button", { name: "New conversation" }).click();
  release();
  await expect(page.locator(".ai-answer")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Find my starting point/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Find my starting point/ }).click();
  await expect(page.locator(".ai-answer-text")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".ai-answer-text img")).toHaveCount(0);
});
