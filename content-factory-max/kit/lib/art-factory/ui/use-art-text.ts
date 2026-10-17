"use client";

import { useEffect, useState } from "react";

import { loadArtText } from "./api";

/**
 * Loads the alt texts and captions once and re-renders when they arrive, so
 * `artSrc(path, { withText: true })` has them:
 *
 * ```tsx
 * useArtText();
 * const heart = artSrc("art/icons/heart.webp", { withText: true });
 * <img src={heart.src} alt={heart.alt} />
 * ```
 */
export function useArtText(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadArtText().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
