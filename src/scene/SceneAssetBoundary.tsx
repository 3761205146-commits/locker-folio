import { Component, Suspense, type ReactNode } from 'react'
import { SceneAssetError } from './reliableTexture'

/** An unavailable image hides only its own item. Reconnect retries failed
 * resources, not successful siblings. Programming errors still propagate. */
export default class SceneAssetBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  private reconnect = () => {
    if (!(this.state.error instanceof SceneAssetError)) return
    this.state.error.retry()
    this.setState({ error: null })
  }
  componentDidMount() { window.addEventListener('online', this.reconnect) }
  componentWillUnmount() { window.removeEventListener('online', this.reconnect) }
  componentDidCatch(error: Error) {
    if (error instanceof SceneAssetError) console.warn(error.message)
  }
  render() {
    if (this.state.error) {
      if (this.state.error instanceof SceneAssetError) return null
      throw this.state.error
    }
    return <Suspense fallback={null}>{this.props.children}</Suspense>
  }
}
