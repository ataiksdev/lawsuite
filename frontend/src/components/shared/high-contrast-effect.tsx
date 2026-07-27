'use client';

import { useEffect } from 'react';
import { useHighContrastStore } from '@/lib/high-contrast-store';

// Applies the `high-contrast` class to <html> independently of next-themes'
// light/dark class, so the boost stacks on top of whichever theme is active
// (see the `.dark.high-contrast` overrides in globals.css).
export function HighContrastEffect() {
  const enabled = useHighContrastStore((state) => state.enabled);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', enabled);
  }, [enabled]);

  return null;
}

export default HighContrastEffect;
