import { aiError } from "../../ai/config.js";
import { catalogueFingerprint } from "./catalogue.js";
import {
  SYSTEM_PROMPT,
  selectionSchema,
  validateSelections,
  sourceView,
  roleLabels,
  insufficientAnswer,
} from "./grounding.js";

export function createAiService({
  config,
  provider,
  vectorStore,
  catalogue,
  activity,
}) {
  async function retrieve(
    query,
    { availableOnly = false, bookIds = [], maxContext = 12 } = {},
  ) {
    const [embedding] = await provider.embed([query]);
    const candidates = await vectorStore.search(embedding, {
      limit: 80,
      bookIds,
    });
    const books = await catalogue.getBooks([
      ...new Set(candidates.map((v) => String(v.book))),
    ]);
    const lookup = new Map(books.map((book) => [String(book._id), book]));
    const perBook = new Map();
    const seen = new Set();
    let budget = 18000;
    const context = [];
    for (const chunk of [...candidates].sort((a, b) => {
      const relevance = b.relevance - a.relevance;
      if (relevance) return relevance;
      // When semantic scores tie, an authored passage supports a more useful
      // citation than the book's short catalogue description.
      const excerptPriority =
        Number(b.metadata.sourceType === "excerpt") -
        Number(a.metadata.sourceType === "excerpt");
      return excerptPriority;
    })) {
      const book = lookup.get(String(chunk.book));
      if (
        !book ||
        !Number.isFinite(chunk.relevance) ||
        chunk.relevance < config.AI_MIN_RELEVANCE ||
        chunk.relevance > 1 ||
        !chunk.content?.trim()
      )
        continue;
      if (availableOnly && !(book.availableCopies > 0)) continue;
      if (
        chunk.metadata.sourceType === "catalogue" &&
        chunk.metadata.catalogueFingerprint !== catalogueFingerprint(book)
      )
        continue;
      const key = `${book._id}:${chunk.metadata.contentHash}`;
      if (
        seen.has(key) ||
        (perBook.get(String(book._id)) || 0) >= 2 ||
        chunk.content.length > budget
      )
        continue;
      seen.add(key);
      perBook.set(String(book._id), (perBook.get(String(book._id)) || 0) + 1);
      budget -= chunk.content.length;
      context.push({ ...chunk, id: `S${context.length + 1}`, book });
      if (context.length >= maxContext) break;
    }
    return context;
  }
  function resultsFrom(context, limit) {
    const results = new Map();
    for (const item of context) {
      const id = String(item.book._id),
        source = sourceView(item);
      if (results.has(id)) {
        results.get(id).sources.push(source);
        continue;
      }
      results.set(id, {
        book: item.book,
        relevance: Math.round(item.relevance * 10000) / 10000,
        reason: `Related ${item.metadata.sourceType === "catalogue" ? "catalogue description" : "library excerpt"}: “${source.excerpt}”`,
        sources: [source],
      });
    }
    return [...results.values()].slice(0, limit);
  }
  async function select(query, details = {}) {
    const retrievalQuery = [query, details.background]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    const context = await retrieve(retrievalQuery, {
      bookIds: details.contextBookIds || [],
    });
    if (!context.length) return [];
    const raw = await provider.select({
      system: SYSTEM_PROMPT,
      schema: selectionSchema(context),
      input: {
        question: query,
        task: details.task || "reading-guidance",
        background: details.background || "",
        durationWeeks: details.durationWeeks,
        libraryContext: context.map((c) => ({
          sourceId: c.id,
          bookId: String(c.book._id),
          title: c.book.title,
          authors: (c.book.authors || [])
            .slice(0, 8)
            .map((v) => v.slice(0, 150)),
          category: c.book.category?.slice(0, 200),
          tags: (c.book.tags || []).slice(0, 20).map((v) => v.slice(0, 120)),
          availableCopies: c.book.availableCopies,
          totalCopies: c.book.totalCopies,
          publicationYear: c.book.publicationYear,
          sourceType: c.metadata.sourceType,
          chapter: c.chapter,
          section: c.section,
          content: c.content,
        })),
      },
    });
    const selections = validateSelections(raw, context);
    if (!selections.length) return [];
    // Book data can change while generation runs. Never return a deleted book or stale availability.
    const freshBooks = await catalogue.getBooks(
      selections.map((s) => String(s.book._id)),
    );
    const currentChunks = await vectorStore.currentIds(
      selections.map((s) => String(s._id)),
    );
    return selections.map((s) => {
      const book = freshBooks.find((b) => String(b._id) === String(s.book._id));
      if (
        !book ||
        !currentChunks.includes(String(s._id)) ||
        (s.metadata.sourceType === "catalogue" &&
          s.metadata.catalogueFingerprint !== catalogueFingerprint(book))
      ) {
        throw aiError(
          409,
          "The library sources changed while preparing your answer. Please try again.",
        );
      }
      return { ...s, book };
    });
  }
  return {
    async search({ q, limit, availableOnly }, userId) {
      const context = await retrieve(q, {
        availableOnly,
        maxContext: Math.min(40, limit * 2),
      });
      const results = resultsFrom(context, limit);
      const historyRecorded = await activity.recordSearch(
        userId,
        q,
        results.map((v) => String(v.book._id)),
      );
      return { query: q, results, historyRecorded };
    },
    async ask({ query, contextBookIds }) {
      const selected = await select(query, { contextBookIds });
      if (!selected.length)
        return {
          answer: insufficientAnswer,
          sources: [],
          books: [],
          insufficientContext: true,
        };
      const answer =
        "Based on the retrieved library resources, here is a suggested reading direction:\n\n" +
        selected
          .map(
            (s) =>
              `${roleLabels[s.role]}: ${s.book.title} [${s.id}]\nThe ${s.metadata.sourceType === "catalogue" ? "catalogue description" : "source excerpt"} says: “${s.excerpt}”`,
          )
          .join("\n\n") +
        "\n\nThis order is a reading suggestion, not a verified prerequisite sequence. Check the book cards for current availability.";
      return {
        answer,
        sources: selected.map(sourceView),
        books: selected.map((s) => s.book),
        insufficientContext: false,
      };
    },
    async learningPath({ goal, durationWeeks, background }) {
      const selected = (
        await select(goal, { task: "learning-path", background, durationWeeks })
      ).slice(0, durationWeeks);
      const steps = selected.map((s, i) => ({
        startWeek: Math.floor((i * durationWeeks) / selected.length) + 1,
        endWeek: Math.floor(((i + 1) * durationWeeks) / selected.length),
        book: s.book,
        source: sourceView(s),
        focus: roleLabels[s.role],
        activities: [
          `Read the cited ${s.metadata.sourceType === "catalogue" ? "description, then use the book’s contents to choose a relevant section" : "section"}.`,
          "Write a short summary of the concepts you encounter and note any unfamiliar prerequisites.",
          "Test your understanding with a small example, and review before moving to the next resource.",
        ],
      }));
      return {
        goal,
        durationWeeks,
        background,
        summary: selected.length
          ? "A suggested schedule using the library resources below. Adjust the pace to your background; the source material does not verify a complete curriculum."
          : insufficientAnswer,
        steps,
        sources: selected.map(sourceView),
        insufficientContext: !selected.length,
      };
    },
    async recommendations({ limit }, userId) {
      const signals = await activity.getSignals(userId);
      const seedIds = [
        ...new Set([...signals.savedBookIds, ...signals.borrowedBookIds]),
      ];
      const seeds = await catalogue.getBooks(seedIds);
      const signalsUsed = [
        signals.interests.length && "interests",
        signals.savedBookIds.length && "saved-books",
        signals.borrowedBookIds.length && "borrowing-history",
        signals.searches.length && "search-history",
      ].filter(Boolean);
      const query = [
        signals.interests.join(", "),
        ...seeds.map(
          (b) => `${b.title}: ${b.category} ${(b.tags || []).join(", ")}`,
        ),
        ...signals.searches,
      ]
        .join("\n")
        .trim()
        .slice(0, 2000);
      if (!query)
        return {
          results: [],
          strategy: "cold-start",
          signalsUsed,
          message:
            "Add interests, save a book, or search the catalogue to get personal recommendations.",
        };
      const context = await retrieve(query, { maxContext: 40 });
      const excluded = new Set(seedIds);
      const results = resultsFrom(context, 40)
        .filter((r) => !excluded.has(String(r.book._id)))
        .slice(0, limit);
      return { results, strategy: "semantic-activity-profile", signalsUsed };
    },
  };
}
