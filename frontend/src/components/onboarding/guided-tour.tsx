// ============================================================================
// Lawmate - Guided Tour
// Renders a spotlight ring around the current step's target element plus a
// positioned tooltip card with Back/Next/Skip controls. Navigates the app
// between steps automatically (steps span multiple pages).
// ============================================================================

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navigate, useCurrentRoute } from '@/lib/router';
import { useOnboardingStore } from '@/lib/onboarding-store';
import { TOUR_STEPS } from '@/lib/onboarding-steps';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

function useTargetRect(selector: string | undefined, attempt: number): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let raf = 0;

    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return false;
      }
      const r = el.getBoundingClientRect();
      if (!cancelled) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      return true;
    };

    // Poll briefly for the target to mount (route just changed).
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const found = measure();
      tries += 1;
      if (!found && tries < 40) {
        raf = window.setTimeout(tick, 50);
      }
    };
    tick();

    const onReflow = () => measure();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);

    return () => {
      cancelled = true;
      window.clearTimeout(raf);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, attempt]);

  return rect;
}

export function GuidedTour() {
  const { isTourActive, stepIndex, nextStep, prevStep, stopTour } = useOnboardingStore();
  const currentRoute = useCurrentRoute();
  const step = TOUR_STEPS[stepIndex];

  // Bump this whenever the route changes so useTargetRect re-polls for the new target.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (isTourActive && step && currentRoute !== step.route) {
      navigate(step.route);
    }
    setAttempt((a) => a + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, isTourActive]);

  const rect = useTargetRect(isTourActive ? step?.selector : undefined, attempt);

  const handleNext = useCallback(() => nextStep(TOUR_STEPS.length), [nextStep]);

  useEffect(() => {
    if (!isTourActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopTour();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') prevStep();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTourActive, stopTour, handleNext, prevStep]);

  if (!isTourActive || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Position the card: below-right of the target if there's room, else above; centered if no target.
  let cardStyle: React.CSSProperties;
  if (rect) {
    const cardWidth = 320;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = rect.left;
    if (left + cardWidth > viewportW - 16) left = Math.max(16, viewportW - cardWidth - 16);
    const spaceBelow = viewportH - (rect.top + rect.height);
    const placeBelow = spaceBelow > 220;
    cardStyle = placeBelow
      ? { position: 'fixed', top: rect.top + rect.height + PAD + 8, left }
      : { position: 'fixed', bottom: viewportH - rect.top + PAD + 8, left };
  } else {
    cardStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Guided tour" aria-live="polite">
      {rect && (
        <div
          className="fixed rounded-lg ring-2 ring-emerald-500 shadow-[0_0_0_4000px_rgba(15,23,42,0.45)] transition-all duration-200 pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}
      {!rect && <div className="fixed inset-0 bg-slate-900/45" />}

      <div
        className="w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Step {stepIndex + 1} of {TOUR_STEPS.length}
          </p>
          <button
            type="button"
            onClick={stopTour}
            aria-label="Close tour"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={stopTour} className="text-slate-500">
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={prevStep}>
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
              </Button>
            )}
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleNext}>
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GuidedTour;
