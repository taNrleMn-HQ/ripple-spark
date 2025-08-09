import React from "react";
import * as ReactPixi from "@pixi/react";
const { Stage, Container, useTick, Graphics, Text } = ReactPixi;
import { Application, Filter, Renderer, FederatedPointerEvent, Container as PixiContainer } from "pixi.js";

// Device pixel ratio helper
const DPR = () => Math.max(1, window.devicePixelRatio || 1);

// Visual viewport size in CSS pixels
function useVisualViewportSize() {
  const get = () => {
    const vv = window.visualViewport as VisualViewport | undefined;
    return vv
      ? { w: vv.width, h: vv.height, left: vv.offsetLeft || 0, top: vv.offsetTop || 0 }
      : { w: window.innerWidth, h: window.innerHeight, left: 0, top: 0 };
  };
  const [size, setSize] = React.useState(get);
  React.useEffect(() => {
    const vv = window.visualViewport as VisualViewport | undefined;
    const handler = () => setSize(get());
    window.addEventListener("resize", handler);
    if (vv) {
      vv.addEventListener("resize", handler);
      vv.addEventListener("scroll", handler);
    }
    return () => {
      window.removeEventListener("resize", handler);
      if (vv) {
        vv.removeEventListener("resize", handler);
        vv.removeEventListener("scroll", handler);
      }
    };
  }, []);
  return size;
}

// Ripple filter hook: creates a full-screen postprocess filter and exposes a trigger
function useRippleFilter(getCssSize: () => { w: number; h: number }) {
  const frag = `
  precision highp float;
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  uniform vec2  u_res;        // device px
  uniform vec2  u_centerPx;   // device px
  uniform float u_time;       // seconds from start
  uniform float u_duration;   // seconds
  uniform float u_strength;   // px
  uniform float u_speed;      // px / s
  uniform float u_width;      // px

  // Optional procedural grid (warps with the effect)
  uniform float u_gridSpacing;  // CSS px spacing (scaled externally by DPR)
  uniform float u_gridMinorA;
  uniform float u_gridMajorA;

  float ring(float d, float r, float w){
    float x = (d - r) / max(w, 0.0001);
    return exp(-x*x*4.0);
  }

  float gridMask(vec2 px, float spacing){
    float sx = mod(px.x, spacing);
    float sy = mod(px.y, spacing);
    float distToLine = min(min(sx, spacing - sx), min(sy, spacing - sy));
    // thin line around 1px
    return smoothstep(1.5, 0.0, distToLine);
  }

  void main(){
    vec2 uv = vTextureCoord;
    vec2 px = uv * u_res;

    float t = clamp(u_time, 0.0, u_duration);
    float play = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(u_duration - 0.20, u_duration, t));

    float radius = u_speed * t;
    float d = distance(px, u_centerPx);
    float k = ring(d, radius, u_width) * play;

    vec2 dir = normalize(px - u_centerPx + 0.0001);
    float disp = u_strength * k;

    vec2 uv_r = (px + dir * (disp * 1.00)) / u_res;
    vec2 uv_g = (px + dir * (disp * 0.80)) / u_res;
    vec2 uv_b = (px + dir * (disp * 0.60)) / u_res;

    float micro = 0.2 * sin((d - radius) * 0.05) * k;
    uv_r += dir * micro / u_res;
    uv_g -= dir * micro / u_res;

    vec3 color = vec3(
      texture2D(uSampler, uv_r).r,
      texture2D(uSampler, uv_g).g,
      texture2D(uSampler, uv_b).b
    );

    if (u_gridSpacing > 0.0) {
      float spacing = u_gridSpacing;
      float minor = gridMask(px, spacing);
      float major = gridMask(px, spacing * 5.0);
      color = mix(color, vec3(1.0), minor * u_gridMinorA);
      color = mix(color, vec3(1.0), major * u_gridMajorA);
    }

    gl_FragColor = vec4(color, 1.0);
  }`;

  const filterRef = React.useRef<Filter>();
  const stateRef = React.useRef<{ start: number; duration: number; running: boolean }>({ start: 0, duration: 1.1, running: false });

  if (!filterRef.current) {
    filterRef.current = new Filter(undefined, frag, {
      u_res: { x: 1, y: 1 },
      u_centerPx: { x: 0.0, y: 0.0 },
      u_time: 0,
      u_duration: 1.1,
      u_strength: 22.0 * DPR(),
      u_speed: 900.0,
      u_width: 48.0,
      u_gridSpacing: 100.0 * DPR(), // scale by DPR so spacing is in CSS px visually
      u_gridMinorA: 0.12,
      u_gridMajorA: 0.22,
    } as any);
  }

  // Per-frame uniforms update
  useTick(() => {
    const f = filterRef.current!;
    const { w, h } = getCssSize();
    const dpr = DPR();
    (f.uniforms as any).u_res = { x: w * dpr, y: h * dpr };

    const s = stateRef.current;
    if (s.running) {
      const t = (performance.now() - s.start) / 1000;
      (f.uniforms as any).u_time = t;
      if (t >= s.duration) {
        (f.uniforms as any).u_time = s.duration;
        s.running = false;
      }
    }
  });

  function trigger(centerCssX: number, centerCssY: number, duration = 1.1) {
    const { w, h } = getCssSize();
    const dpr = DPR();
    const cx = centerCssX * dpr;
    const cy = centerCssY * dpr;

    const W = w * dpr, H = h * dpr;
    const d1 = Math.hypot(cx - 0,   cy - 0);
    const d2 = Math.hypot(cx - W,   cy - 0);
    const d3 = Math.hypot(cx - 0,   cy - H);
    const d4 = Math.hypot(cx - W,   cy - H);
    const maxDist = Math.max(d1, d2, d3, d4) + 2.0 * dpr;

    const f = filterRef.current!;
    (f.uniforms as any).u_centerPx = { x: cx, y: cy };
    (f.uniforms as any).u_duration = duration;
    (f.uniforms as any).u_strength = 22.0 * dpr;
    (f.uniforms as any).u_width = 48.0;
    (f.uniforms as any).u_speed = (maxDist * 1.08) / duration;

    stateRef.current = { start: performance.now(), duration, running: true };
  }

  return { filter: filterRef.current!, trigger };
}

// Applies a filter to its children by attaching it to the container
function FilteredScene({ filter, children }: { filter: Filter; children: React.ReactNode }) {
  const ref = React.useRef<PixiContainer | null>(null);
  React.useEffect(() => {
    const c = ref.current as unknown as any;
    if (!c) return;
    c.filters = [filter];
    return () => { c.filters = []; };
  }, [filter]);
  return <Container ref={ref as any}>{children}</Container>;
}

function GridLayer({ width, height, spacing }: { width: number; height: number; spacing: number }) {
  return (
    <Graphics
      draw={(g) => {
        g.clear();
        // Minor lines
        g.lineStyle(1, 0xffffff, 0.12);
        for (let x = 0; x <= width; x += spacing) {
          g.moveTo(x, 0).lineTo(x, height);
        }
        for (let y = 0; y <= height; y += spacing) {
          g.moveTo(0, y).lineTo(width, y);
        }
        // Major lines
        g.lineStyle(1, 0xffffff, 0.22);
        const major = spacing * 5;
        for (let x = 0; x <= width; x += major) {
          g.moveTo(x, 0).lineTo(x, height);
        }
        for (let y = 0; y <= height; y += major) {
          g.moveTo(0, y).lineTo(width, y);
        }
      }}
    />
  );
}

function Hero({ onClickCenter }: { onClickCenter: (r: DOMRect) => void }) {
  const btn = { x: 0, y: 120, w: 200, h: 44, r: 8 };
  return (
    <Container x={32} y={Math.max(48, Math.floor(0.22 * window.innerHeight))}>
      <Text
        text="Warp the page with a single tap"
        anchor={0}
        style={{ fill: 0xffffff, fontSize: 48, fontWeight: "600", wordWrap: true, wordWrapWidth: Math.min(800, window.innerWidth - 64) } as any}
      />
      <Text
        text="A full-screen ripple that distorts everything it touches."
        y={64}
        style={{ fill: 0xffffff, alpha: 0.7, fontSize: 20, wordWrap: true, wordWrapWidth: Math.min(800, window.innerWidth - 64) } as any}
      />
      <Graphics
        x={btn.x}
        y={btn.y}
        interactive
        cursor="pointer"
        draw={(g) => {
          g.clear();
          g.beginFill(0xffffff, 0.12);
          g.lineStyle(1, 0xffffff, 0.35);
          g.drawRoundedRect(0, 0, btn.w, btn.h, btn.r);
          g.endFill();
        }}
        pointertap={(e: FederatedPointerEvent) => {
          const target = e.currentTarget as any; // Graphics
          const b = target.getBounds();
          onClickCenter(new DOMRect(b.x, b.y, b.width, b.height));
        }}
      />
      <Text text="Test Ripple" x={btn.x + btn.w / 2} y={btn.y + btn.h / 2} anchor={0.5 as any} style={{ fill: 0xffffff, fontSize: 16 } as any} />
    </Container>
  );
}

export default function WebGLStage() {
  const { w, h, left, top } = useVisualViewportSize();
  const rendererRef = React.useRef<Renderer | null>(null);

  const { filter, trigger } = useRippleFilter(() => ({ w, h }));

  React.useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      trigger(e.clientX - (left || 0), e.clientY - (top || 0));
    };
    window.addEventListener("pointerdown", onPointer, { passive: true } as any);
    return () => window.removeEventListener("pointerdown", onPointer as any);
  }, [trigger, left, top]);

  const onButtonClick = (r: DOMRect) => {
    trigger(r.left + r.width / 2 - (left || 0), r.top + r.height / 2 - (top || 0));
  };

  return (
    <Stage
      width={Math.max(1, Math.floor(w))}
      height={Math.max(1, Math.floor(h))}
      options={{
        background: 0x233241,
        resolution: DPR(),
        autoDensity: true,
        antialias: true,
      }}
      onMount={(app: Application) => { rendererRef.current = app.renderer as Renderer; }}
    >
      {/* Everything inside FilteredScene is post-processed by the ripple filter */}
      <FilteredScene filter={filter}>
        <GridLayer width={w} height={h} spacing={100} />
        <Hero onClickCenter={onButtonClick} />
      </FilteredScene>
    </Stage>
  );
}
