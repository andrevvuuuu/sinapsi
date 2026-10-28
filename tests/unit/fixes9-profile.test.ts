import { describe, expect, it } from 'vitest'
import { chromiumProfileDir } from '../../src/main/store/paths'

describe('the Chromium profile of a test instance', () => {
  it('lives inside its own data folder, so parallel instances and the real app never share it', () => {
    expect(chromiumProfileDir({ SINAPSI_DATA: '/tmp/e2e-1' })).toBe('/tmp/e2e-1/chromium')
    expect(chromiumProfileDir({})).toBeNull()
  })
})
