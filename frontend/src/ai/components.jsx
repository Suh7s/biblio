import React from "react";
import { Link } from "react-router-dom";

export function Icon({ name = "spark", size = 20, ...props }) {
  const paths = {
    spark: (
      <>
        <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z" />
        <path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    path: (
      <>
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9" />
      </>
    ),
    book: (
      <>
        <path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2Z" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    send: (
      <>
        <path d="m5 12 7-7 7 7M12 5v15" />
      </>
    ),
    heart: (
      <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4m-6 2-3 3a4 4 0 0 0 6 6l3-3m-4-7 3-3a4 4 0 0 1 6 6l-3 3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
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
