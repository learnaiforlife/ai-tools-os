import React from 'react';
import { Workbench } from './workbench.jsx';

class RecoveryBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main data-aios-recovery style={{ padding: 40, fontFamily: 'system-ui' }}><h1>AIOS could not display this view</h1><p>Your on-disk configuration is unaffected by this display error.</p><pre>{String(this.state.error.message)}</pre><button onClick={() => window.location.reload()}>Reload application</button></main>;
    return this.props.children;
  }
}
export function App() { return <RecoveryBoundary><Workbench /></RecoveryBoundary>; }
