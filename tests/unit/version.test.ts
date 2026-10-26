import { describe, expect, it } from 'vitest'
import { APP_NAME } from '../../src/shared/version'

describe('app identity', () => {
  it('is called Sinapsi', () => {
    expect(APP_NAME).toBe('Sinapsi')
  })
})
