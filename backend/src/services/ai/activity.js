import mongoose from "mongoose";
import SearchHistory from "../../models/SearchHistory.js";
import { aiError } from "../../ai/config.js";

export const activity = {
  async recordSearch(userId, query, results) {
    // A history outage must not turn successful retrieval into a failed search.
    try {
      await SearchHistory.create({
        user: userId,
        query,
        searchType: "semantic",
        results,
      });
      return true;
    } catch {
      return false;
    }
  },
  async getSignals(userId) {
    if (!mongoose.isObjectIdOrHexString(userId))
      throw aiError(401, "A valid authenticated user is required.");
    const user = new mongoose.Types.ObjectId(userId);
    const db = mongoose.connection.db;
    const [profile, saved, borrowed, searches] = await Promise.all([
      db
        .collection("users")
        .findOne(
          { _id: user },
          { projection: { interests: 1, "profile.interests": 1 } },
        ),
      db
        .collection("savedbooks")
        .find({ user })
        .project({ book: 1 })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
      db
        .collection("borrows")
        .find({ user, status: { $in: ["BORROWED", "RETURNED", "OVERDUE"] } })
        .project({ book: 1 })
        .sort({ borrowedAt: -1 })
        .limit(20)
        .toArray(),
      SearchHistory.find({
        user,
        createdAt: { $gte: new Date(Date.now() - 90 * 86400000) },
      })
        .select("query")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);
    const interests = profile?.interests || profile?.profile?.interests || [];
    return {
      interests: Array.isArray(interests)
        ? interests
            .filter((v) => typeof v === "string")
            .slice(0, 20)
            .map((v) => v.slice(0, 120))
        : [],
      savedBookIds: saved
        .map((v) => String(v.book))
        .filter((v) => /^[a-f\d]{24}$/i.test(v)),
      borrowedBookIds: borrowed
        .map((v) => String(v.book))
        .filter((v) => /^[a-f\d]{24}$/i.test(v)),
      searches: searches.map((v) => v.query.slice(0, 300)),
    };
  },
};
