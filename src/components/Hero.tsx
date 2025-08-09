import React, { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useRipple } from "@/hooks/useRipple";

export default function Hero() {
  const { triggerRipple } = useRipple();
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Trigger ripple from the center of the button and prevent global listener
  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = btnRef.current;
    if (!el || !triggerRipple) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    triggerRipple({ clientX: cx, clientY: cy });
  }, [triggerRipple]);

  // Block the window-level pointerdown so we get exactly one ripple
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  return (
    <section className="relative flex min-h-[80vh] items-center">
      {/* Background accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 10%, hsl(var(--foreground)/0.06) 0%, transparent 60%)",
        }}
      />

      <div className="w-full mx-auto px-6">
        <div className="max-w-3xl">
          <h1 className="text-4xl/tight md:text-6xl/tight font-semibold tracking-tight">
            Warp the page with a single tap
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground">
            A full-screen ripple that distorts everything it touches. Tap below to test it.
          </p>

          <div className="mt-8">
            <Button
              ref={btnRef}
              onPointerDown={handlePointerDown}
              onClick={handleClick}
              size="lg"
            >
              Test Ripple
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
