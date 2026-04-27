'use client';

import React, { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Point = { x: number; y: number };

function pointsToPath(points: Point[]) {
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function serializeSvg(paths: string[]) {
  const body = paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 220">${body}</svg>`;
}

function toSvgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function SvgSketchpad({
  value,
  onChange,
  className,
}: {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [drawing, setDrawing] = useState(false);

  const displaySvg = useMemo(() => {
    if (paths.length > 0 || currentPoints.length > 0) {
      const livePaths = currentPoints.length ? [...paths, pointsToPath(currentPoints)] : paths;
      return serializeSvg(livePaths);
    }
    return value || '';
  }, [currentPoints, paths, value]);

  const pointerToPoint = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 600;
    const y = ((event.clientY - rect.top) / rect.height) * 220;
    return { x, y };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerToPoint(event);
    setDrawing(true);
    setCurrentPoints([point]);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const point = pointerToPoint(event);
    setCurrentPoints((current) => [...current, point]);
  };

  const finishStroke = () => {
    if (!drawing) return;
    setDrawing(false);
    if (currentPoints.length === 0) return;
    const newPath = pointsToPath(currentPoints);
    setPaths((current) => {
      const next = [...current, newPath];
      onChange(serializeSvg(next));
      return next;
    });
    setCurrentPoints([]);
  };

  const clear = () => {
    setPaths([]);
    setCurrentPoints([]);
    setDrawing(false);
    onChange('');
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="relative h-44 rounded-xl border border-dashed border-emerald-300 bg-white"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={finishStroke}
      >
        {displaySvg ? (
          <img
            alt="Handwritten note preview"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            src={toSvgDataUrl(displaySvg)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Draw a handwritten note here
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Handwritten notes are stored as SVG.</p>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={clear}>
          Clear sketch
        </Button>
      </div>
    </div>
  );
}

export default SvgSketchpad;
