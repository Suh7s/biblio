import { Router } from "express";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import { authenticate, authorize } from "../middleware/auth.js";
import { getAiConfig, aiError } from "../ai/config.js";
import {
  parse,
  searchInput,
  askInput,
  pathInput,
  recommendationInput,
  chunksInput,
  bookId,
  sourceId,
} from "../ai/validation.js";
import { createProvider } from "../services/ai/provider.js";
import { createVectorStore } from "../services/ai/vector-store.js";
import { catalogue } from "../services/ai/catalogue.js";
import { activity } from "../services/ai/activity.js";
import { createAiService } from "../services/ai/service.js";
import { createIndexer } from "../services/ai/indexing.js";

export function createAiRouter(overrides = {}) {
  const router = Router();
  // Resolve config on first request so missing AI credentials never break the catalogue.
  let dependencies;
  const resolve = () => {
    if (dependencies) return dependencies;
    if (overrides.service && overrides.indexer)
      return (dependencies = overrides);
    const config = getAiConfig();
    const provider = createProvider(config);
    return (dependencies = {
      service: createAiService({
        config,
        provider,
        vectorStore: createVectorStore(config),
        catalogue,
        activity,
      }),
      indexer: createIndexer({ config, provider, catalogue }),
    });
  };
  router.use(authenticate, authorize("USER", "ADMIN"));
  router.use((req, res, next) => {
    if (!mongoose.isObjectIdOrHexString(req.user.id))
      return next(aiError(401, "A valid authenticated user is required."));
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(
    overrides.limiter ||
      rateLimit({
        windowMs: 60000,
        limit: 30,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        keyGenerator: (req) => String(req.user.id),
        message: {
          success: false,
          message: "Too many AI requests. Please wait a minute and try again.",
          errors: {},
        },
      }),
  );
  const respond = (message, action) => async (req, res, next) => {
    try {
      res.json({ success: true, message, data: await action(req) });
    } catch (error) {
      next(error);
    }
  };
  router.get(
    "/search",
    respond("Semantic search completed.", (req) => {
      const input = parse(searchInput, req.query);
      return resolve().service.search(input, req.user.id);
    }),
  );
  router.post(
    "/ask",
    respond("Library answer prepared.", (req) => {
      const input = parse(askInput, req.body);
      return resolve().service.ask(input);
    }),
  );
  router.post(
    "/learning-path",
    respond("Learning path prepared.", (req) => {
      const input = parse(pathInput, req.body);
      return resolve().service.learningPath(input);
    }),
  );
  router.get(
    "/recommendations",
    respond("Recommendations retrieved.", (req) => {
      const input = parse(recommendationInput, req.query);
      return resolve().service.recommendations(input, req.user.id);
    }),
  );
  router.post(
    "/books/:bookId/index",
    authorize("ADMIN"),
    respond("Catalogue source indexed.", (req) => {
      const id = parse(bookId, req.params.bookId);
      return resolve().indexer.indexCatalogue(id);
    }),
  );
  router.put(
    "/books/:bookId/chunks",
    authorize("ADMIN"),
    respond("Library source indexed.", (req) => {
      const id = parse(bookId, req.params.bookId),
        input = parse(chunksInput, req.body);
      return resolve().indexer.replaceSource(id, input);
    }),
  );
  router.delete(
    "/books/:bookId/chunks/:sourceId",
    authorize("ADMIN"),
    respond("Library source removed.", (req) => {
      const id = parse(bookId, req.params.bookId),
        source = parse(sourceId, req.params.sourceId);
      return resolve().indexer.deleteSource(id, source);
    }),
  );
  return router;
}
export default createAiRouter();
