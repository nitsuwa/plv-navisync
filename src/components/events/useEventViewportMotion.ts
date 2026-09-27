import { useCallback, useEffect, useRef, useState } from "react";

export interface EventViewportTransform {
  zoom: number;
  pan: { x: number; y: number };
}

interface UseEventViewportMotionOptions {
  initialZoom: number;
  initialPan: { x: number; y: number };
  clampPan: (pan: { x: number; y: number }, zoom: number) => { x: number; y: number };
  reducedMotion?: boolean;
}

interface ActiveViewportAnimation {
  frame: number;
  startedAt: number;
  lastFrameAt: number | null;
  duration: number;
  from: EventViewportTransform;
  target: EventViewportTransform;
}

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

function systemPrefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useEventViewportMotion({
  initialZoom,
  initialPan,
  clampPan,
  reducedMotion,
}: UseEventViewportMotionOptions) {
  const initial = useRef<EventViewportTransform>({ zoom: initialZoom, pan: initialPan });
  const [transform, setTransform] = useState(initial.current);
  const currentRef = useRef<EventViewportTransform>(initial.current);
  const targetRef = useRef<EventViewportTransform>(initial.current);
  const clampPanRef = useRef(clampPan);
  const animationRef = useRef<ActiveViewportAnimation | null>(null);
  const reduceMotion = reducedMotion ?? systemPrefersReducedMotion();

  useEffect(() => {
    clampPanRef.current = clampPan;
  }, [clampPan]);

  const cancelMotion = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current.frame);
    animationRef.current = null;
    // A gesture can begin between animation frames. Keep the next viewport
    // command anchored to what is actually visible instead of the old target.
    targetRef.current = {
      zoom: currentRef.current.zoom,
      pan: { ...currentRef.current.pan },
    };
  }, []);

  const commit = useCallback((next: EventViewportTransform) => {
    const safe = {
      zoom: next.zoom,
      pan: clampPanRef.current(next.pan, next.zoom),
    };
    currentRef.current = safe;
    setTransform(safe);
    return safe;
  }, []);

  const setImmediateTransform = useCallback((next: EventViewportTransform) => {
    cancelMotion();
    const safe = commit(next);
    targetRef.current = safe;
  }, [cancelMotion, commit]);

  const animateTo = useCallback((next: EventViewportTransform, duration = 180) => {
    const target = {
      zoom: next.zoom,
      pan: clampPanRef.current(next.pan, next.zoom),
    };
    if (reduceMotion || duration <= 0) {
      setImmediateTransform(target);
      return;
    }

    const existing = animationRef.current;
    if (!existing) cancelMotion();
    targetRef.current = target;
    const animation: ActiveViewportAnimation = existing ?? {
      frame: 0,
      // The first requestAnimationFrame timestamp is the only clock source we
      // trust here. Browsers and test environments may expose different
      // time origins for performance.now() and the RAF callback timestamp.
      startedAt: Number.NaN,
      lastFrameAt: null,
      duration,
      from: {
        zoom: currentRef.current.zoom,
        pan: { ...currentRef.current.pan },
      },
      target,
    };
    // Wheel input may retarget many times per frame. Reuse one RAF loop and
    // restart its interpolation from the currently visible frame so events do
    // not queue competing animations or trail behind the pointer.
    if (existing) {
      animation.duration = duration;
      animation.from = {
        zoom: currentRef.current.zoom,
        pan: { ...currentRef.current.pan },
      };
      animation.target = target;
      if (animation.lastFrameAt !== null) animation.startedAt = animation.lastFrameAt;
      return;
    }
    animationRef.current = animation;

    const tick = (now: number) => {
      if (animationRef.current !== animation) return;
      if (!Number.isFinite(animation.startedAt)) animation.startedAt = now;
      animation.lastFrameAt = now;
      const progress = clampProgress((now - animation.startedAt) / animation.duration);
      const eased = easeOutCubic(progress);
      commit({
        zoom: animation.from.zoom + (animation.target.zoom - animation.from.zoom) * eased,
        pan: {
          x: animation.from.pan.x + (animation.target.pan.x - animation.from.pan.x) * eased,
          y: animation.from.pan.y + (animation.target.pan.y - animation.from.pan.y) * eased,
        },
      });
      if (progress >= 1) {
        animationRef.current = null;
        const safe = commit(animation.target);
        targetRef.current = safe;
        return;
      }
      animation.frame = requestAnimationFrame(tick);
    };

    animation.frame = requestAnimationFrame(tick);
  }, [cancelMotion, commit, reduceMotion, setImmediateTransform]);

  useEffect(() => cancelMotion, [cancelMotion]);

  return {
    zoom: transform.zoom,
    pan: transform.pan,
    currentRef,
    targetRef,
    animateTo,
    setImmediateTransform,
    cancelMotion,
  };
}
