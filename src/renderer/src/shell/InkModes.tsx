import React from 'react';
import './signature.css';
import { FluidFilterBar, DEFAULT_STUDY_ITEMS } from './fluid-filter/FluidFilterBar';

export const MODES = ['Studia', 'Esercitati', 'Ripassa'] as const;
export type Mode = (typeof MODES)[number];

export interface InkModesProps {
  mode: Mode;
  due: number;
  studyCount: number | null;
  practiceCount: number | null;
  onChange: (mode: Mode) => void;
}

/**
 * Thin wrapper around FluidFilterBar for the composer study mode filter in TodayView.
 * Maintains 100% identical public API with Mode type and props.
 */
export function InkModes({
  mode,
  due,
  studyCount,
  practiceCount,
  onChange,
}: InkModesProps): React.JSX.Element {
  const count = mode === 'Ripassa' ? due : mode === 'Esercitati' ? practiceCount : studyCount;
  const label = mode === 'Ripassa' ? 'dovuti' : 'suggerimenti';

  return (
    <FluidFilterBar
      className="sg-ink"
      items={DEFAULT_STUDY_ITEMS}
      activeId={mode}
      onSelect={(id) => onChange(id as Mode)}
      count={count}
      label={label}
      height={38}
    />
  );
}
