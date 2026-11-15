"use client"

import { useEffect, useRef, useState } from "react"
import styles from "./hero-scene.module.css"

export function HeroScene() {
  const container = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = container.current
    if (!host) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (motion.matches) return

    let disposed = false
    let cleanup = () => {}
    async function setup() {
      const THREE = await import("three")
      if (disposed || !host) return
      let renderer: import("three").WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" })
      } catch {
        return
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.25
      host.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
      camera.position.set(0, 1.3, 10)
      camera.lookAt(0, 0, 0)
      scene.add(new THREE.AmbientLight(0xc5f4dd, 1.1))
      const key = new THREE.PointLight(0xf8d99b, 130, 25)
      key.position.set(4, 5, 6)
      scene.add(key)
      const rim = new THREE.PointLight(0x58e0a8, 105, 20)
      rim.position.set(-4, 1, 3)
      scene.add(rim)

      const gold = new THREE.MeshStandardMaterial({ color: 0xc5a770, metalness: 0.86, roughness: 0.23 })
      const emerald = new THREE.MeshPhysicalMaterial({ color: 0x1e8766, metalness: 0.55, roughness: 0.15, transparent: true, opacity: 0.7, clearcoat: 1, clearcoatRoughness: 0.12 })
      const glow = new THREE.MeshBasicMaterial({ color: 0xbde9d0, transparent: true, opacity: 0.8 })
      const dark = new THREE.MeshStandardMaterial({ color: 0x123f39, metalness: 0.8, roughness: 0.3 })
      const object = new THREE.Group()
      object.position.y = 0.35
      scene.add(object)
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.02, 0), emerald)
      object.add(core)
      const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), gold)
      object.add(inner)
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.04, 0)), new THREE.LineBasicMaterial({ color: 0xa4ecc6, transparent: true, opacity: 0.55 }))
      object.add(wire)
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.035, 12, 120), gold)
      halo.rotation.set(1.1, 0.35, 0.3)
      object.add(halo)
      const halo2 = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.012, 8, 120), glow)
      halo2.rotation.set(1.25, -0.3, -0.4)
      object.add(halo2)
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.09, 16, 4), gold)
      band.rotation.set(0.65, 0.5, 0.5)
      object.add(band)

      const base = new THREE.Group()
      base.position.y = -1.65
      scene.add(base)
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.32, 0.25, 64), dark)
      base.add(platform)
      const edge = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.025, 8, 100), gold)
      edge.rotation.x = Math.PI / 2
      edge.position.y = 0.13
      base.add(edge)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.015, 8, 100), glow)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.14
      base.add(ring)

      const points = new Float32Array(150 * 3)
      for (let i = 0; i < points.length; i += 3) {
        const angle = Math.random() * Math.PI * 2
        const radius = 2.2 + Math.random() * 2.4
        points[i] = Math.cos(angle) * radius
        points[i + 1] = (Math.random() - 0.5) * 4
        points[i + 2] = Math.sin(angle) * radius
      }
      const particlesGeometry = new THREE.BufferGeometry()
      particlesGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3))
      const particles = new THREE.Points(particlesGeometry, new THREE.PointsMaterial({ color: 0xc5dcb6, size: 0.025, transparent: true, opacity: 0.65 }))
      scene.add(particles)

      let frame = 0
      let visible = true
      let targetX = 0
      let targetY = 0
      const resize = () => {
        const { width, height } = host.getBoundingClientRect()
        if (!width || !height) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.position.z = width < 500 ? 12 : 10
        camera.updateProjectionMatrix()
      }
      const onPointer = (event: PointerEvent) => {
        const rect = host.getBoundingClientRect()
        targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.3
        targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 0.2
      }
      const resetPointer = () => { targetX = 0; targetY = 0 }
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
      observer.observe(host)
      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
      host.addEventListener("pointermove", onPointer)
      host.addEventListener("pointerleave", resetPointer)
      resize()
      const clock = new THREE.Clock()
      const animate = () => {
        frame = requestAnimationFrame(animate)
        if (!visible || document.hidden) return
        const time = clock.getElapsedTime()
        const scrollProgress = Math.min(1, Math.max(0, -host.getBoundingClientRect().top / Math.max(window.innerHeight, 1)))
        object.rotation.y += 0.003
        object.rotation.x += (targetY + scrollProgress * 0.65 - object.rotation.x) * 0.025
        object.rotation.z += (targetX - object.rotation.z) * 0.025
        object.position.y = 0.35 + Math.sin(time * 0.7) * 0.11 + scrollProgress * 0.5
        inner.rotation.x += 0.006
        halo2.rotation.z -= 0.002
        particles.rotation.y += 0.0005
        renderer.render(scene, camera)
      }
      animate()
      setReady(true)
      cleanup = () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        resizeObserver.disconnect()
        host.removeEventListener("pointermove", onPointer)
        host.removeEventListener("pointerleave", resetPointer)
        scene.traverse((item) => {
          if (item instanceof THREE.Mesh || item instanceof THREE.LineSegments || item instanceof THREE.Points) {
            item.geometry.dispose()
            const materials = Array.isArray(item.material) ? item.material : [item.material]
            materials.forEach((material) => material.dispose())
          }
        })
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
    void setup().catch(() => {})
    return () => { disposed = true; cleanup() }
  }, [])

  return <div ref={container} className={styles.scene} data-ready={ready} aria-hidden="true" />
}
