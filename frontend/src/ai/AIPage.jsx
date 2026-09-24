import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "./components.jsx";
import AIChat from "./AIChat.jsx";
import SemanticSearch from "./SemanticSearch.jsx";
import LearningPath from "./LearningPath.jsx";
import Recommendations from "./Recommendations.jsx";
import "./ai.css";

const modes = [
  {
    id: "chat",
    label: "Ask LibraAI",
    icon: "spark",
    note: "A conversation with your library",
  },
  {
    id: "search",
    label: "Semantic search",
    icon: "search",
    note: "Find the idea behind the words",
  },
  {
    id: "path",
    label: "Learning path",
    icon: "path",
    note: "Build a thoughtful reading journey",
  },
  {
    id: "recommendations",
    label: "For you",
    icon: "heart",
    note: "Follow your next connection",
  },
];
export default function AIPage() {
  const [params, setParams] = useSearchParams();
  const mode = modes.find((m) => m.id === params.get("mode")) || modes[0];
  return (
    <main className="ai-workspace">
      <aside className="ai-sidebar">
        <Link to="/ai" className="ai-product">
          <span className="ai-product-icon">
            <Icon size={23} />
          </span>
          <span>
            LibraAI<small>YOUR KNOWLEDGE COMPANION</small>
          </span>
        </Link>
        <div className="ai-sidebar-caption">SPACE TO EXPLORE</div>
        <nav aria-label="AI tools">
          {modes.map((m) => (
            <button
              type="button"
              key={m.id}
              className={mode.id === m.id ? "ai-nav-active" : ""}
              aria-current={mode.id === m.id ? "page" : undefined}
              onClick={() => setParams(m.id === "chat" ? {} : { mode: m.id })}
            >
              <Icon name={m.icon} size={18} />
              <span>{m.label}</span>
              {mode.id === m.id && <span className="ai-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="ai-sidebar-bottom">
          <div className="ai-library-note">
            <Icon name="shield" size={20} />
            <h3>
              Your library.
              <br />
              Your source of truth.
            </h3>
            <p>
              Every recommendation leads back to a real resource in the
              collection.
            </p>
            <Link to="/books">
              Explore the catalogue <Icon name="arrow" size={14} />
            </Link>
          </div>
          <span className="ai-sidebar-foot">BUILT FOR CURIOUS MINDS</span>
        </div>
      </aside>
      <div className="ai-main">
        <header className="ai-workspace-header">
          <div>
            <span className="ai-overline">DISCOVER / LIBRAAI</span>
            <h1>{mode.label}</h1>
          </div>
          <span className="ai-context-label">
            <Icon name="book" size={15} /> Library grounded
          </span>
        </header>
        <div className="ai-content">
          <div hidden={mode.id !== "chat"}>
            <AIChat />
          </div>
          <div hidden={mode.id !== "search"}>
            <SemanticSearch active={mode.id === "search"} />
          </div>
          <div hidden={mode.id !== "path"}>
            <LearningPath />
          </div>
          <div hidden={mode.id !== "recommendations"}>
            <Recommendations active={mode.id === "recommendations"} />
          </div>
        </div>
        <div className="ai-workspace-foot">
          <span>Curiosity, with a source.</span>
          <span>LIBRAMIND / DISCOVER KNOWLEDGE</span>
        </div>
      </div>
    </main>
  );
}
