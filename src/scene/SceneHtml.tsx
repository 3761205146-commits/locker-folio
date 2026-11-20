import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo, type ComponentProps } from 'react'

/** Html creates a DOM root when its portal target changes. Bind it to the
 * app-owned Canvas host immediately, rather than following events.connected
 * from the measuring div to the event host. Each Canvas owns its own target. */
export default function SceneHtml(props: Omit<ComponentProps<typeof Html>, 'portal'>) {
  const gl = useThree((state) => state.gl)
  const portal = useMemo(() => {
    const target = gl.domElement.closest<HTMLElement>('.hero__canvas')
    return target ? { current: target } : null
  }, [gl])
  return portal ? <Html {...props} portal={portal} /> : null
}
