import { Component, type ReactNode } from 'react';

type Props = { label: string; children: ReactNode; onClose?: () => void };

export class ScreenBoundary extends Component<Props> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="panel">
      <h2 className="panel-title" role="alert">{this.props.label} couldn’t open.</h2>
      <div className="row">
        <button type="button" className="btn" onClick={() => window.location.reload()}>Reload screen</button>
        {this.props.onClose && <button type="button" className="btn quiet" onClick={this.props.onClose}>Close</button>}
      </div>
    </section>;
  }
}
