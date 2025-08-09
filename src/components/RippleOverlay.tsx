import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { RippleContext, RIPPLE_DEFAULTS, RippleConfig, RippleTrigger } from "@/hooks/useRipple";
import { rippleVertex, rippleFragment } from "@/lib/shaders/ripple";

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile failed: " + info);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
  const vert = createShader(gl, gl.VERTEX_SHADER, vs);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error("Program link failed: " + info);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

export type RippleOverlayProps = PropsWithChildren<{ config?: Partial<RippleConfig> }>;

export const RippleOverlay: React.FC<RippleOverlayProps> = ({ children, config }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const attribPosLocRef = useRef<number>(-1);
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const textureRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef<number | null>(null);
  const animatingRef = useRef(false);
  const startTimeRef = useRef(0);
  const centerUVRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const dprRef = useRef<number>(Math.max(1, window.devicePixelRatio || 1));
  const capturingRef = useRef<Promise<HTMLCanvasElement> | null>(null);
  const lastSnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const speedRef = useRef<number>(RIPPLE_DEFAULTS.speed);
  const fadeStartedRef = useRef(false);

  const effective: RippleConfig = useMemo(() => ({ ...RIPPLE_DEFAULTS, ...(config || {}) }), [config]);

  // Reduced motion
  const [motionEnabled, setMotionEnabled] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotionEnabled(!mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Setup GL
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;
    glRef.current = gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    canvas.style.transition = "opacity 140ms ease-out";
    canvas.style.opacity = "0";

    // Program
    const program = createProgram(gl, rippleVertex, rippleFragment);
    programRef.current = program;
    gl.useProgram(program);

    // Fullscreen triangle
    const posLoc = gl.getAttribLocation(program, "a_pos");
    attribPosLocRef.current = posLoc;
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const verts = new Float32Array([
      -1, -1,
      3, -1,
      -1, 3,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    uniformsRef.current = {
      u_tex: gl.getUniformLocation(program, "u_tex"),
      u_res: gl.getUniformLocation(program, "u_res"),
      u_center: gl.getUniformLocation(program, "u_center"),
      u_time: gl.getUniformLocation(program, "u_time"),
      u_duration: gl.getUniformLocation(program, "u_duration"),
      u_strength: gl.getUniformLocation(program, "u_strength"),
      u_speed: gl.getUniformLocation(program, "u_speed"),
      u_width: gl.getUniformLocation(program, "u_width"),
    };

    // Texture setup
    const tex = gl.createTexture();
    textureRef.current = tex;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Blending for alpha fade
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // Initial sizing
    const resize = () => {
      dprRef.current = Math.max(1, window.devicePixelRatio || 1);
      const w = Math.floor(window.innerWidth * dprRef.current);
      const h = Math.floor(window.innerHeight * dprRef.current);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      gl.viewport(0, 0, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      gl.deleteTexture(textureRef.current);
      gl.deleteProgram(programRef.current);
    };
  }, []);

  const uploadTexture = useCallback((snapCanvas: HTMLCanvasElement) => {
    const gl = glRef.current;
    if (!gl || !textureRef.current) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      snapCanvas
    );
  }, []);

  const captureSnapshot = useCallback((): Promise<HTMLCanvasElement> => {
    // If already capturing, return the same promise
    if (capturingRef.current) return capturingRef.current;

    const DPR = Math.max(1, window.devicePixelRatio || 1);

    // Ensure overlay isn't captured
    const overlay = canvasRef.current;
    const prevOpacity = overlay?.style.opacity;
    if (overlay) overlay.style.opacity = "0";

    const promise = html2canvas(document.documentElement, {
      backgroundColor: null,
      useCORS: true,
      scale: DPR,
    }).then((pageCanvas) => {
      // Copy only the current viewport slice into a DPR-sized canvas
      const out = document.createElement("canvas");
      const w = Math.floor(window.innerWidth * DPR);
      const h = Math.floor(window.innerHeight * DPR);
      out.width = w;
      out.height = h;
      const ctx = out.getContext("2d")!;

      const sx = Math.floor(window.scrollX * DPR);
      const sy = Math.floor(window.scrollY * DPR);
      const sw = Math.floor(window.innerWidth * DPR);
      const sh = Math.floor(window.innerHeight * DPR);

      ctx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, w, h);
      lastSnapshotRef.current = out;
      return out;
    }).finally(() => {
      capturingRef.current = null;
      if (overlay && prevOpacity !== undefined) overlay.style.opacity = prevOpacity!;
    });

    capturingRef.current = promise;
    return promise;
  }, []);

  const drawFrame = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas) return;

    rafRef.current = requestAnimationFrame(drawFrame);

    const tSec = (performance.now() - startTimeRef.current) / 1000;

    gl.useProgram(programRef.current);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const u = uniformsRef.current;
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, canvas.width, canvas.height);
    gl.uniform2f(u.u_center, centerUVRef.current.x, centerUVRef.current.y);
    gl.uniform1f(u.u_time, tSec);
    gl.uniform1f(u.u_duration, effective.duration);
    gl.uniform1f(u.u_strength, effective.strength * dprRef.current);
    gl.uniform1f(u.u_speed, speedRef.current);
    gl.uniform1f(u.u_width, effective.width);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (tSec >= effective.duration) {
      if (!fadeStartedRef.current) {
        fadeStartedRef.current = true;
        canvas.style.opacity = "0";
        const onFade = () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current!);
          rafRef.current = null;
          animatingRef.current = false;
          fadeStartedRef.current = false;
          canvas.removeEventListener("transitionend", onFade as any);
        };
        canvas.addEventListener("transitionend", onFade as any, { once: true } as any);
      }
    }
  }, [effective.duration, effective.speed, effective.strength, effective.width]);

  const renderOnce = useCallback((tSec: number) => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas) return;
    gl.useProgram(programRef.current);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const u = uniformsRef.current;
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_res, canvas.width, canvas.height);
    gl.uniform2f(u.u_center, centerUVRef.current.x, centerUVRef.current.y);
    gl.uniform1f(u.u_time, tSec);
    gl.uniform1f(u.u_duration, effective.duration);
    gl.uniform1f(u.u_strength, effective.strength * dprRef.current);
    gl.uniform1f(u.u_speed, speedRef.current);
    gl.uniform1f(u.u_width, effective.width);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }, [effective.duration, effective.strength, effective.width]);

  const triggerRipple: RippleTrigger = useCallback(({ clientX, clientY }) => {
    if (!motionEnabled) return;
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // 1) Set the click center (no Y inversion)
    centerUVRef.current = { x: clientX / w, y: clientY / h };

    const startAnim = () => {
      // 3) Compute dynamic speed so radius reaches the farthest corner by end
      const W = canvas.width;   // device px
      const H = canvas.height;
      const cxPx = centerUVRef.current.x * W;
      const cyPx = centerUVRef.current.y * H;

      const d1 = Math.hypot(cxPx - 0,   cyPx - 0);
      const d2 = Math.hypot(cxPx - W,   cyPx - 0);
      const d3 = Math.hypot(cxPx - 0,   cyPx - H);
      const d4 = Math.hypot(cxPx - W,   cyPx - H);
      const DPR = dprRef.current;
      const maxDist = Math.max(d1, d2, d3, d4) + 2.0 * DPR;

      // Slight overshoot so it fully clears screen by end of duration
      const overshoot = 1.06;
      speedRef.current = (maxDist * overshoot) / effective.duration;

      // 4) Start animation only now that texture & uniforms are ready
      startTimeRef.current = performance.now();
      animatingRef.current = true;
      // Pre-render one frame before revealing the canvas to avoid first-frame flash
      renderOnce(0.0001);
      canvas.style.opacity = "1";
      if (!rafRef.current) rafRef.current = requestAnimationFrame(drawFrame);
    };

    // 2) Ensure we have a snapshot BEFORE we show the overlay the first time
    let snap = lastSnapshotRef.current;
    if (!snap) {
      captureSnapshot()
        .then((s) => {
          uploadTexture(s);
          startAnim();
        })
        .catch(() => {});
      return;
    } else {
      uploadTexture(snap);
    }

    // 5) Start now that texture is ready
    startAnim();

    // 6) Fire off a fresh snapshot in the background for the next tap (only when overlay is hidden)
    if (!animatingRef.current && (canvas.style.opacity === "" || canvas.style.opacity === "0")) {
      captureSnapshot().then(uploadTexture).catch(() => {});
    }
  }, [captureSnapshot, drawFrame, motionEnabled, uploadTexture, effective.duration]);

  // Global pointer trigger (click/tap anywhere)
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      triggerRipple({ clientX: e.clientX, clientY: e.clientY });
    };
    window.addEventListener("pointerdown", onPointer, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [triggerRipple]);

  return (
    <RippleContext.Provider value={{ triggerRipple, enabled: motionEnabled, config: effective }}>
      {children}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-[9999] select-none will-change-[opacity]"
        aria-hidden
      />
    </RippleContext.Provider>
  );
};
