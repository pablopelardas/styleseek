// Same test from TSX: `Find Selected Selector` reads the text, not the
// language server, so it works here exactly as it does in HTML and Vue.

export function App() {
  return (
    <div className="org-tree">
      <div className="org-tree__controls">
        <button className="org-tree__controls-button" type="button">
          Click
        </button>
      </div>
    </div>
  );
}
