import { Component, type ReactNode } from "react";
import { Logo, Mochi } from "./Artwork";
import { downloadJSON, loadData } from "../storage";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; notice: string }
> {
  state = { failed: false, notice: "" };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-loading">
        <Logo />
        <Mochi flower />
        <h2>A little hiccup in your workspace.</h2>
        <p>Reload the app, or download a backup of your saved plans.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Open my workspace again
        </button>
        <button
          className="button secondary"
          onClick={async () => {
            const data = await loadData().catch(() => undefined);
            if (data) {
              downloadJSON(data);
              this.setState({ notice: "Your saved plans are ready to keep." });
            } else
              this.setState({
                notice:
                  "No saved workspace could be read. Check that your browser allows device storage.",
              });
          }}
        >
          Download my saved plans
        </button>
        {this.state.notice && <p role="status">{this.state.notice}</p>}
      </main>
    );
  }
}
