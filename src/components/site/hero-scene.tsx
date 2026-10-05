"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, reducedMotion } from "./motion";

// The hero's 3D brand mark: the MyAlgoAgent robot rebuilt as stacked, bevelled plates (clearcoat
// physical materials with room reflections), a frame behind it, an orbit ring with a satellite and a
// slowly turning network of points. Three.js loads only here, in its own chunk.

const PURPLE = 0x471898;
const PURPLE_LIGHT = 0x6a35c2;
const GOLD = 0xbda360;
const NAVY = 0x0e1b2d;

/** The robot face for the top plate, drawn once into a canvas texture. */
function faceCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 512, 512);
  // eyes
  g.fillStyle = "#471898";
  for (const x of [196, 316]) {
    g.beginPath();
    g.arc(x, 258, 30, 0, Math.PI * 2);
    g.fill();
  }
  // mouth line
  g.strokeStyle = "rgba(71,24,152,0.55)";
  g.lineWidth = 12;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(222, 338);
  g.lineTo(290, 338);
  g.stroke();
  return c;
}

export default function HeroScene({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let stop = () => {};

    (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch {
        setFailed(true);
        return;
      }
      const small = window.matchMedia("(max-width: 767px)").matches;
      const reduced = reducedMotion();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute("aria-hidden", "true");
      Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      let baseZ = 13;
      camera.position.set(0, 0.4, baseZ);

      // Lights: ambient, key, purple rim, gold accent.
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(4, 6, 8);
      scene.add(key);
      const rim = new THREE.PointLight(PURPLE_LIGHT, 60, 30);
      rim.position.set(-5, 2, -3);
      scene.add(rim);
      const accent = new THREE.PointLight(GOLD, 40, 25);
      accent.position.set(5, -3, 4);
      scene.add(accent);

      // ---- the plate stack ----
      const rounded = (w: number, r: number) => {
        const s = new THREE.Shape();
        const h = w / 2;
        s.moveTo(-h + r, -h);
        s.lineTo(h - r, -h);
        s.quadraticCurveTo(h, -h, h, -h + r);
        s.lineTo(h, h - r);
        s.quadraticCurveTo(h, h, h - r, h);
        s.lineTo(-h + r, h);
        s.quadraticCurveTo(-h, h, -h, h - r);
        s.lineTo(-h, -h + r);
        s.quadraticCurveTo(-h, -h, -h + r, -h);
        return s;
      };
      const stack = new THREE.Group();
      scene.add(stack);
      const plateDefs = [
        { color: NAVY, size: 2.9, metal: 0.6 },
        { color: PURPLE, size: 2.75, metal: 0.35 },
        { color: GOLD, size: 2.6, metal: 0.85 },
        { color: 0xffffff, size: 2.45, metal: 0.05 },
      ];
      const plates: import("three").Group[] = [];
      const gap = 0.42;
      plateDefs.forEach((d, i) => {
        const geo = new THREE.ExtrudeGeometry(rounded(d.size, 0.55), { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 6, curveSegments: 24 });
        geo.center();
        const mat = new THREE.MeshPhysicalMaterial({ color: d.color, metalness: d.metal, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 });
        const mesh = new THREE.Mesh(geo, mat);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: i === 3 ? PURPLE_LIGHT : 0xffffff, transparent: true, opacity: i === 3 ? 0.35 : 0.12 }));
        const g = new THREE.Group();
        g.add(mesh, edges);
        g.position.z = (i - 1.5) * gap;
        g.userData = { baseZ: g.position.z, phase: i * 0.9 };
        stack.add(g);
        plates.push(g);
      });
      // Robot face decal + antenna and ears on the top plate.
      const top = plates[3];
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(faceCanvas()), transparent: true }));
      (face.material.map as import("three").Texture).colorSpace = THREE.SRGBColorSpace;
      face.position.z = 0.18;
      top.add(face);
      const bitMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1 });
      const antenna = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.45, 6, 12), bitMat);
      antenna.position.set(0, 1.55, 0);
      top.add(antenna);
      for (const x of [-1.5, 1.5]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.55, 6, 12), bitMat);
        ear.position.set(x, 0, 0);
        top.add(ear);
      }

      // Frame behind the stack.
      const frameShape = rounded(4.4, 0.9);
      frameShape.holes.push(rounded(4.0, 0.75) as unknown as import("three").Path);
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.06, bevelEnabled: false, curveSegments: 24 }), new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.25, transparent: true, opacity: 0.55 }));
      frame.geometry.center();
      frame.position.z = -1.6;
      scene.add(frame);

      // Orbit ring with a satellite.
      const orbit = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: PURPLE_LIGHT, transparent: true, opacity: 0.55 }));
      const sat = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 24), new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.2, emissive: GOLD, emissiveIntensity: 0.25 }));
      sat.position.x = 3.3;
      orbit.add(ring, sat);
      orbit.rotation.set(1.15, 0.25, 0);
      scene.add(orbit);

      // Network of points with precomputed nearest-neighbour links.
      const count = small ? 60 : 130;
      const pts: number[] = [];
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = 6 + Math.random() * 5;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const v = [r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th) * 0.6, r * Math.cos(ph) - 4];
        pos.set(v, i * 3);
        pts.push(...v);
      }
      const links: number[] = [];
      for (let i = 0; i < count; i++) {
        const d: [number, number][] = [];
        for (let j = 0; j < count; j++) if (j !== i) d.push([j, (pts[i * 3] - pts[j * 3]) ** 2 + (pts[i * 3 + 1] - pts[j * 3 + 1]) ** 2 + (pts[i * 3 + 2] - pts[j * 3 + 2]) ** 2]);
        d.sort((a, b) => a[1] - b[1]);
        for (const [j] of d.slice(0, 2)) if (i < j) links.push(...pts.slice(i * 3, i * 3 + 3), ...pts.slice(j * 3, j * 3 + 3));
      }
      const net = new THREE.Group();
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      net.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: GOLD, size: 0.05, transparent: true, opacity: 0.8 })));
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(links, 3));
      net.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PURPLE_LIGHT, transparent: true, opacity: 0.22 })));
      scene.add(net);

      // ---- sizing ----
      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Fit: the ~7-unit-wide scene stays inside the box whatever its shape.
        const fitW = 7.5 / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
        const fitH = 7.5 / (2 * Math.tan((camera.fov * Math.PI) / 360));
        baseZ = Math.max(fitW, fitH, 12);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      // ---- interaction state ----
      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      const onMove = (e: PointerEvent) => {
        mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });
      const scroll = { p: 0 };
      const st = ScrollTrigger.create({ trigger: host.closest("section") ?? host, start: "top top", end: "bottom top", scrub: true, onUpdate: (s) => (scroll.p = s.progress) });

      // Intro: plates drop in and spin into place.
      const intro = { k: reduced ? 1 : 0 };
      const playIntro = () => {
        if (reduced) return;
        plates.forEach((p, i) => {
          gsap.fromTo(p.position, { y: 6 + i }, { y: 0, duration: 1.6, ease: "power4.out", delay: 0.12 * i });
          gsap.fromTo(p.rotation, { z: -1.6 }, { z: 0, duration: 1.8, ease: "power4.out", delay: 0.12 * i });
        });
        gsap.to(intro, { k: 1, duration: 1.8, ease: "power3.out" });
      };
      if (!reduced) plates.forEach((p, i) => (p.position.y = 6 + i));
      const started = document.documentElement.classList.contains("mk-intro-go");
      if (started || reduced) playIntro();
      else window.addEventListener("mk:intro", playIntro, { once: true });

      // ---- render loop (paused off-screen / hidden tab) ----
      const t0 = performance.now();
      let visible = true;
      let raf = 0;
      const frameFn = () => {
        const t = (performance.now() - t0) / 1000;
        mouse.x += (mouse.tx - mouse.x) * 0.06;
        mouse.y += (mouse.ty - mouse.y) * 0.06;
        const p = scroll.p;
        plates.forEach((pl) => {
          const { baseZ, phase } = pl.userData as { baseZ: number; phase: number };
          pl.position.z = baseZ * (1 + p * 2.6) + Math.sin(t * 1.1 + phase) * 0.05;
          if (intro.k >= 1) pl.position.y = Math.sin(t * 0.9 + phase) * 0.06;
        });
        stack.rotation.y = -0.5 + mouse.x * 0.25 + p * 1.2;
        stack.rotation.x = 0.28 + mouse.y * 0.15 + p * 0.35;
        frame.rotation.y = stack.rotation.y * 0.6;
        frame.rotation.x = stack.rotation.x * 0.6;
        orbit.rotation.z = t * 0.35;
        net.rotation.y = t * 0.03;
        camera.position.z = baseZ + p * 5;
        camera.position.x = mouse.x * 0.3;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      };
      const loop = () => {
        frameFn();
        raf = requestAnimationFrame(loop);
      };
      const play = () => {
        if (!raf && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop);
      };
      const pause = () => {
        cancelAnimationFrame(raf);
        raf = 0;
      };
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) play();
        else pause();
      });
      io.observe(host);
      const onVis = () => (document.hidden ? pause() : play());
      document.addEventListener("visibilitychange", onVis);
      frameFn(); // a first frame straight away, even before the loop (or in a background tab)
      if (!reduced) play();

      stop = () => {
        pause();
        io.disconnect();
        ro.disconnect();
        st.kill();
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("mk:intro", playIntro);
        scene.traverse((o) => {
          const m = o as import("three").Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          mats.forEach((mt) => {
            (mt as import("three").MeshBasicMaterial).map?.dispose();
            mt.dispose();
          });
        });
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setFailed(true));

    return () => {
      disposed = true;
      stop();
    };
  }, []);

  return (
    <div ref={hostRef} className={className} aria-hidden>
      {failed && (
        // Fallback: the flat brand mark with a soft glow.
        <div className="grid h-full place-items-center">
          <div className="h-48 w-48 rounded-[28%] bg-[radial-gradient(circle_at_30%_25%,var(--mk-accent-2),var(--mk-accent))] shadow-[0_0_120px_20px_rgba(106,53,194,0.45)]" />
        </div>
      )}
    </div>
  );
}
