import React, { useEffect, useRef, useState } from "react";
import {
  Icon,
  ErrorState,
  LoadingState,
  ResourceCard,
  SourceCitation,
} from "./components.jsx";
import { useAiRequest } from "./useAiRequest.js";

const suggestions = [
  {
    label: "Find my starting point",
    query:
      "I know Python and calculus. What should I read to start learning robotics?",
    icon: "path",
  },
  {
    label: "Connect the concepts",
    query: "What should I read before learning reinforcement learning?",
    icon: "spark",
  },
  {
    label: "Explore a new subject",
    query: "Help me find resources about how robots perceive and navigate.",
    icon: "search",
  },
];
export default function AIChat() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [followSources, setFollowSources] = useState(false);
  const lastRequest = useRef(null),
    end = useRef(null),
    input = useRef(null);
  const { busy, error, run, cancel } = useAiRequest();
  const latestAnswer = [...messages].reverse().find((m) => m.kind === "answer");
  useEffect(() => {
    if (messages.length)
      end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  async function send(text, retry = false) {
    if (busy || text.trim().length < 3) return;
    const request = retry
      ? lastRequest.current
      : {
          query: text.trim(),
          contextBookIds: followSources
            ? latestAnswer?.data.books.map((b) => b._id).slice(0, 6) || []
            : [],
        };
    lastRequest.current = request;
    if (!retry) {
      setMessages((v) => [...v, { kind: "question", text: request.query }]);
      setQuery("");
    }
    const data = await run("post", "/ask", request);
    if (data) {
      setMessages((v) => [...v, { kind: "answer", data }]);
      setFollowSources(false);
      input.current?.focus();
    }
  }
  function clear() {
    cancel();
    setMessages([]);
    setQuery("");
    setFollowSources(false);
    lastRequest.current = null;
    input.current?.focus();
  }
  return (
    <section className="ai-chat-panel" aria-label="Library assistant">
      <div className="ai-panel-top">
        <span>
          <i /> YOUR LIBRARY, IN CONTEXT
        </span>
        <button type="button" className="ai-text-button" onClick={clear}>
          <Icon name="plus" size={15} /> New conversation
        </button>
      </div>
      {!messages.length ? (
        <div className="ai-welcome">
          <div className="ai-orbit-mark">
            <div />
            <Icon size={34} />
          </div>
          <span className="ai-overline">
            A LITTLE CURIOSITY GOES A LONG WAY
          </span>
          <h2>
            What will you
            <br />
            <em>discover today?</em>
          </h2>
          <p>
            Follow a question. Find a connection. Let your library
            <br className="ai-desktop-break" /> help you take the next step.
          </p>
          <div className="ai-suggestion-grid">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.label}
                onClick={() => send(s.query)}
                disabled={busy}
              >
                <Icon name={s.icon} />
                <strong>{s.label}</strong>
                <span>{s.query}</span>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="ai-messages"
          role="log"
          aria-label="Conversation"
          aria-live="polite"
        >
          {messages.map((message, index) =>
            message.kind === "question" ? (
              <div className="ai-question" key={index}>
                <span>YOU</span>
                <p>{message.text}</p>
              </div>
            ) : (
              <article className="ai-answer" key={index}>
                <div className="ai-answer-byline">
                  <span className="ai-badge">
                    <Icon size={16} />
                  </span>
                  <strong>LibraAI</strong>
                  <span>GROUNDED IN YOUR LIBRARY</span>
                </div>
                <p className="ai-answer-text">{message.data.answer}</p>
                {message.data.books.length > 0 && (
                  <div className="ai-answer-books">
                    {message.data.books.map((book) => (
                      <ResourceCard key={book._id} book={book} compact />
                    ))}
                  </div>
                )}
                {message.data.sources.length > 0 && (
                  <div className="ai-citations">
                    <div className="ai-overline">
                      SOURCES · {message.data.sources.length}
                    </div>
                    {message.data.sources.map((source) => (
                      <SourceCitation key={source.id} source={source} />
                    ))}
                  </div>
                )}
              </article>
            ),
          )}
          <div ref={end} />
        </div>
      )}
      <ErrorState
        message={error}
        retry={() => send(lastRequest.current.query, true)}
      />
      {busy && (
        <LoadingState
          label="Reading relevant library sources…"
          cancel={cancel}
        />
      )}
      <form
        className="ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(query);
        }}
      >
        {latestAnswer?.data.books.length > 0 && (
          <label className="ai-follow-sources">
            <input
              type="checkbox"
              checked={followSources}
              onChange={(e) => setFollowSources(e.target.checked)}
            />{" "}
            Focus this question on the previous answer’s books
          </label>
        )}
        <div className="ai-composer-field">
          <Icon size={21} />
          <textarea
            ref={input}
            aria-label="Ask LibraAI"
            placeholder="I’m curious about…"
            rows={2}
            maxLength={2000}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send(query);
              }
            }}
          />
          <button
            type="submit"
            aria-label="Send question"
            disabled={busy || query.trim().length < 3}
          >
            <Icon name="send" size={21} />
          </button>
        </div>
        <div className="ai-composer-note">
          <span>
            <Icon name="shield" size={13} /> Answers rooted in real library
            resources.
          </span>
          <span>Enter to send · Shift + Enter for a new line</span>
        </div>
      </form>
    </section>
  );
}
