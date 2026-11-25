import type { CSSProperties, HTMLAttributes, JSX } from 'react'
import './skeleton.css'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number
  height?: string | number
  radius?: 'sm' | 'md' | 'lg' | 'pill'
  className?: string
  style?: CSSProperties
}

export function Skeleton({
  width,
  height,
  radius = 'md',
  className = '',
  style,
  ...rest
}: SkeletonProps): JSX.Element {
  return (
    <div
      className={`skeleton skeleton-${radius} ${className}`.trim()}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style
      }}
      aria-hidden="true"
      {...rest}
    />
  )
}
