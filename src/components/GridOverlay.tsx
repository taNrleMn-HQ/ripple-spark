import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function GridOverlay() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = document.createElement("div");
    host.id = "grid-overlay-root";
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483000", // below ripple overlay (2147483647)
      pointerEvents: "none",
      overflow: "hidden",
    } as CSSStyleDeclaration);
    document.body.appendChild(host);
    hostRef.current = host;
    setReady(true);
    return () => {
      if (hostRef.current) document.body.removeChild(hostRef.current);
      hostRef.current = null;
      setReady(false);
    };
  }, []);

  if (!ready || !hostRef.current) return null;

  // Medium gray-blue base + layered repeating gradients for grid
  // Minor lines every 100px, major lines every 500px
  const style: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    // Base color so html2canvas captures it reliably
    backgroundColor: "#233241",
    backgroundImage: `
      /* minor vertical */
      repeating-linear-gradient(
        to right,
        rgba(255,255,255,0.10) 0,
        rgba(255,255,255,0.10) 1px,
        transparent 1px,
        transparent 100px
      ),
      /* minor horizontal */
      repeating-linear-gradient(
        to bottom,
        rgba(255,255,255,0.10) 0,
        rgba(255,255,255,0.10) 1px,
        transparent 1px,
        transparent 100px
      ),
      /* major vertical */
      repeating-linear-gradient(
        to right,
        rgba(255,255,255,0.18) 0,
        rgba(255,255,255,0.18) 1px,
        transparent 1px,
        transparent 500px
      ),
      /* major horizontal */
      repeating-linear-gradient(
        to bottom,
        rgba(255,255,255,0.18) 0,
        rgba(255,255,255,0.18) 1px,
        transparent 1px,
        transparent 500px
      )
    `,
  };

  return createPortal(<div style={style} />, hostRef.current);
}
