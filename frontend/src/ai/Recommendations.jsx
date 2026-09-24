import React, { useEffect, useRef, useState } from "react";
import { useAiRequest } from "./useAiRequest.js";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  ResultList,
  Icon,
} from "./components.jsx";

export default function Recommendations({ active }) {
  const [data, setData] = useState(null);
  const loaded = useRef(false);
  const { busy, error, run, cancel } = useAiRequest();
  async function refresh() {
    const result = await run("get", "/recommendations", { limit: 6 });
    if (result) setData(result);
  }
  useEffect(() => {
    if (active && !loaded.current) {
      loaded.current = true;
      refresh();
    }
    return () => {
      loaded.current = false;
    };
  }, [active]);
  return (
    <section className="ai-tool-panel" aria-label="Personal recommendations">
      <div className="ai-tool-intro">
        <span className="ai-overline">FOLLOW YOUR INTERESTS</span>
        <h2>
          The next chapter
          <br />
          <em>could be here.</em>
        </h2>
        <p>
          Discover related resources through your interests, saved books,
          borrowing, and recent searches.
        </p>
      </div>
      <button
        className="ai-text-button"
        type="button"
        disabled={busy}
        onClick={refresh}
      >
        Refresh recommendations <Icon name="arrow" size={16} />
      </button>
      <ErrorState message={error} retry={refresh} />
      {busy && <LoadingState cancel={cancel} />}
      {data &&
        !busy &&
        (data.results.length ? (
          <ResultList results={data.results} />
        ) : (
          <EmptyState
            title={
              data.strategy === "cold-start"
                ? "Start with a little curiosity"
                : "No new matches just yet"
            }
          >
            {data.strategy === "cold-start"
              ? data.message
              : "Try exploring a new topic or saving another book. We’ll look for related resources you haven’t already saved or borrowed."}
          </EmptyState>
        ))}
    </section>
  );
}
