import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, errorInfo) { console.error('Application render error:', error, errorInfo) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-error"><p className="eyebrow">APPLICATION ERROR</p><h1>Something went wrong</h1><p>Your latest changes may still have been saved. Reopen your project to check.</p><a className="primary-button" href="#/projects" onClick={() => this.setState({ error: null })}>Return to Projects</a></main>
  }
}
