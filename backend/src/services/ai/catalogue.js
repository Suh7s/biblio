import { createHash } from "node:crypto";
import Book from "../../models/Book.js";

export const bookFields =
  "_id title authors isbn description category tags publisher publicationYear totalCopies availableCopies shelfLocation coverImage";
export const catalogueText = (book) =>
  [
    book.title,
    book.authors?.join(", "),
    book.category,
    book.tags?.join(", "),
    book.description,
  ]
    .filter(Boolean)
    .join("\n");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const catalogueFingerprint = (book) => hash(catalogueText(book));
export const catalogue = {
  async getBooks(ids) {
    return Book.find({ _id: { $in: ids } })
      .select(bookFields)
      .lean();
  },
  async getBook(id) {
    return Book.findById(id).select(bookFields).lean();
  },
};
