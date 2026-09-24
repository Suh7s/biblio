import React, { useRef, useState } from "react";
import { useAiRequest } from "./useAiRequest.js";
import {
  Icon,
  LoadingState,
  ErrorState,
  EmptyState,
  ResourceCard,
  SourceCitation,
} from "./components.jsx";

export default function LearningPath() {
  const [goal, setGoal] = useState(""),
    [background, setBackground] = useState(""),
    [weeks, setWeeks] = useState(8);
  const [path, setPath] = useState(null);
  const { busy, error, run, cancel } = useAiRequest();
  const lastRequest = useRef(null);
  async function generate(
    request = {
      goal: goal.trim(),
      background: background.trim(),
      durationWeeks: Number(weeks),
    },
  ) {
    if (busy) return;
    lastRequest.current = request;
    setPath(null);
    const data = await run("post", "/learning-path", request);
    if (data) setPath(data);
  }
  return (
    <section className="ai-tool-panel" aria-label="Learning path">
      <div className="ai-tool-intro">
        <span className="ai-overline">FROM CURIOSITY TO A PLAN</span>
        <h2>
          Make room
          <br />
          <em>for what’s next.</em>
        </h2>
        <p>
          A reading journey built around your goal, your starting point, and the
          resources in your library.
        </p>
      </div>
      <form
        className="ai-path-form"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label>
          Your learning goal
          <input
            required
            minLength={3}
            maxLength={2000}
            placeholder="I want to learn robotics"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <div className="ai-path-fields">
          <label>
            What you already know <span>Optional</span>
            <input
              maxLength={1000}
              placeholder="Python and calculus"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
          </label>
          <label>
            Time to explore
            <div className="ai-week-input">
              <input
                aria-label="Duration in weeks"
                type="number"
                min={1}
                max={52}
                required
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
              />
              <span>weeks</span>
            </div>
          </label>
        </div>
        <button
          className="ai-primary"
          type="submit"
          disabled={busy || goal.trim().length < 3}
        >
          Build my learning path <Icon name="path" size={18} />
        </button>
      </form>
      <ErrorState message={error} retry={() => generate(lastRequest.current)} />
      {busy && (
        <LoadingState
          label="Connecting library resources into a reading plan…"
          cancel={cancel}
        />
      )}
      {path &&
        (path.insufficientContext ? (
          <EmptyState title="Your path needs more source material">
            {path.summary}
          </EmptyState>
        ) : (
          <div className="ai-learning-result">
            <div className="ai-path-summary">
              <div>
                <span className="ai-overline">YOUR READING JOURNEY</span>
                <h3>{path.goal}</h3>
              </div>
              <span className="ai-week-badge">{path.durationWeeks} weeks</span>
            </div>
            <p className="ai-path-disclaimer">{path.summary}</p>
            <ol className="ai-timeline">
              {path.steps.map((step, index) => (
                <li key={`${step.book._id}-${index}`}>
                  <div className="ai-timeline-dot">{index + 1}</div>
                  <div className="ai-step">
                    <div className="ai-step-heading">
                      <span className="ai-overline">
                        {step.startWeek === step.endWeek
                          ? `WEEK ${step.startWeek}`
                          : `WEEKS ${step.startWeek}–${step.endWeek}`}
                      </span>
                      <h4>{step.focus}</h4>
                    </div>
                    <ResourceCard book={step.book} />
                    <ul>
                      {step.activities.map((activity) => (
                        <li key={activity}>
                          <Icon name="check" size={15} />
                          <span>{activity}</span>
                        </li>
                      ))}
                    </ul>
                    <SourceCitation source={step.source} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
    </section>
  );
}
