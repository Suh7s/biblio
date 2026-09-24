import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAiRequest } from "./useAiRequest.js";
import {
  Icon,
  LoadingState,
  ErrorState,
  EmptyState,
  ResultList,
} from "./components.jsx";

export default function SemanticSearch({ active }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [data, setData] = useState(null);
  const { busy, error, run, cancel } = useAiRequest();
  const initial = useRef(false),
    lastRequest = useRef(null);
  async function search(
    request = {
      q: query.trim(),
      limit: 10,
      availableOnly: String(availableOnly),
    },
  ) {
    if (request.q.length < 3 || busy) return;
    lastRequest.current = request;
    setData(null);
    setParams({ mode: "search", q: request.q }, { replace: true });
    const result = await run("get", "/search", request);
    if (result) setData(result);
  }
  useEffect(() => {
    if (active && !initial.current) {
      initial.current = true;
      if (params.get("q")?.trim().length >= 3) search();
    }
    return () => {
      initial.current = false;
    };
  }, [active]);
  return (
    <section className="ai-tool-panel" aria-label="Semantic search">
      <div className="ai-tool-intro">
        <span className="ai-overline">SEARCH BY MEANING</span>
        <h2>
          A thought is
          <br />
          <em>enough to begin.</em>
        </h2>
        <p>
          Describe what you want to understand. Find resources that connect to
          the idea, even when the words are different.
        </p>
      </div>
      <form
        className="ai-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label htmlFor="semantic-query" className="ai-overline">
          WHAT ARE YOU LOOKING TO LEARN?
        </label>
        <div className="ai-search-input">
          <Icon name="search" />
          <input
            id="semantic-query"
            minLength={3}
            maxLength={2000}
            required
            placeholder="How robots perceive and navigate their environment…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={busy || query.trim().length < 3}>
            Find resources <Icon name="arrow" size={16} />
          </button>
        </div>
        <label className="ai-checkbox">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
          />{" "}
          Only books with copies available
        </label>
      </form>
      <ErrorState message={error} retry={() => search(lastRequest.current)} />
      {busy && <LoadingState cancel={cancel} />}
      {data && (
        <>
          <div className="ai-results-heading">
            <span>
              {data.results.length}{" "}
              {data.results.length === 1 ? "resource" : "resources"} for “
              {data.query}”
            </span>
            <small>ORDERED BY SEMANTIC SIMILARITY</small>
          </div>
          {data.results.length ? (
            <ResultList results={data.results} />
          ) : (
            <EmptyState />
          )}
        </>
      )}
      {!data && !busy && !error && (
        <div className="ai-search-hint">
          <Icon name="spark" />
          <p>
            <strong>Think beyond keywords.</strong>
            <br />
            Try “the mathematics behind machine learning” or “how cities can
            become more sustainable.”
          </p>
        </div>
      )}
    </section>
  );
}
