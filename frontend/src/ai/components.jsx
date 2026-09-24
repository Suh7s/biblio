import React from "react";
import { Link } from "react-router-dom";

import { Icon } from "../ui/Icon.jsx";
export { Icon } from "../ui/Icon.jsx";

export function ErrorState({ message, retry }) {
  if (!message) return null;
  return (
    <div className="ai-error" role="alert">
      <div>
        <strong>Let’s try that again</strong>
        <p>{message}</p>
      </div>
      {retry && (
        <button type="button" onClick={retry}>
          Retry <Icon name="arrow" size={16} />
        </button>
      )}
    </div>
  );
}
export function LoadingState({
  label = "Finding connections in your library…",
  cancel,
}) {
  return (
    <div className="ai-loading" role="status">
      <span className="ai-thinking">
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
      {cancel && (
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
export function EmptyState({ title = "No close matches yet", children }) {
  return (
    <div className="ai-empty">
      <Icon name="book" size={32} />
      <h3>{title}</h3>
      <p>
        {children ||
          "Try a broader subject or a different description. The library may need more source material for this topic."}
      </p>
    </div>
  );
}
export function ResourceCard({ book, compact = false }) {
  const [brokenCover, setBrokenCover] = React.useState(false);
  const available = Number.isFinite(book.availableCopies);
  const color =
    (book.title || "").split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  return (
    <Link
      to={`/books/${book._id}`}
      className={`ai-resource ai-transition-colors ${compact ? "ai-resource-compact" : ""}`}
    >
      <div className={`ai-mini-cover ai-cover-${color}`}>
        {book.coverImage &&
        /^https?:\/\//i.test(book.coverImage) &&
        !brokenCover ? (
          <img
            src={book.coverImage}
            alt=""
            onError={() => setBrokenCover(true)}
          />
        ) : (
          <>
            <span>
              LIBRARY
              <br />
              EDITION
            </span>
            <Icon name="book" size={25} />
            <small>{book.authors?.[0]}</small>
          </>
        )}
      </div>
      <div className="ai-resource-copy">
        <span className="ai-overline">{book.category}</span>
        <h3>{book.title}</h3>
        <p>{book.authors?.join(", ")}</p>
        <span
          className={`ai-availability ${available && book.availableCopies > 0 ? "ai-available" : ""}`}
        >
          <i />
          {available
            ? book.availableCopies > 0
              ? `${book.availableCopies} ${book.availableCopies === 1 ? "copy" : "copies"} available`
              : "Currently unavailable"
            : "Check availability"}
        </span>
      </div>
      <Icon name="arrow" size={18} />
    </Link>
  );
}
export function SourceCitation({ source }) {
  const location = [
    source.chapter,
    source.section,
    source.pageStart && `p. ${source.pageStart}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details className="ai-citation">
      <summary>
        <span className="ai-source-id">{source.id}</span>
        <span>
          {source.book}
          <small>
            {location ||
              (source.sourceType === "catalogue"
                ? "Catalogue description"
                : "Library excerpt")}
          </small>
        </span>
        <Icon name="link" size={15} />
      </summary>
      <div>
        <blockquote>{source.excerpt}</blockquote>
        <Link to={`/books/${source.bookId}`}>
          Open book in catalogue <Icon name="arrow" size={14} />
        </Link>
      </div>
    </details>
  );
}
export function ResultList({ results }) {
  return (
    <div className="ai-results">
      {results.map((result, i) => (
        <article className="ai-search-result" key={result.book._id}>
          <div className="ai-result-number">
            {String(i + 1).padStart(2, "0")}
          </div>
          <div className="ai-result-main">
            <ResourceCard book={result.book} />
            <div className="ai-result-reason">
              <span className="ai-overline">
                <Icon name="spark" size={13} /> Why this resource
              </span>
              <p>{result.reason}</p>
              <div className="ai-similarity">
                Similarity {Math.round(result.relevance * 100)}%{" "}
                <span>· semantic match, not confidence</span>
              </div>
            </div>
            <div className="ai-citations">
              {result.sources.map((s) => (
                <SourceCitation key={s.id} source={s} />
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
