import { createContext, useContext } from "react";

export interface RippleConfig {
  duration: number; // seconds
  strength: number; // pixels (will be multiplied by DPR at runtime)
  speed: number;    // pixels / second
  width: number;    // pixels
}

export const RIPPLE_DEFAULTS: RippleConfig = {
  duration: 1.1,
  strength: 22,
  speed: 900,
  width: 48,
};

export type RippleTrigger = (coords: { clientX: number; clientY: number }) => void;

interface RippleContextValue {
  triggerRipple: RippleTrigger;
  enabled: boolean;
  config: RippleConfig;
}

export const RippleContext = createContext<RippleContextValue | null>(null);

export function useRipple() {
  const ctx = useContext(RippleContext);
  return {
    triggerRipple: (ctx?.triggerRipple ?? (() => {})) as RippleTrigger,
    enabled: !!ctx?.enabled,
    config: ctx?.config ?? RIPPLE_DEFAULTS,
  };
}
