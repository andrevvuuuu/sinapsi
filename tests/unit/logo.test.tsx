// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LogoMark } from '../../src/renderer/src/home/LogoMark'

afterEach(cleanup)

describe('the logo', () => {
  it('is the broken S: two nodes, and the spark in the accent colour of the theme', () => {
    const { container } = render(<LogoMark />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path')).toHaveLength(2)
    expect(svg.querySelector('.spark')!.getAttribute('fill')).toBe('var(--accent)')
  })
  it('is the same drawing as the app icon', () => {
    const icon = readFileSync('build/icon.svg', 'utf8')
    const { container } = render(<LogoMark />)
    for (const p of container.querySelectorAll('path')) expect(icon).toContain(p.getAttribute('d')!)
  })
})
