import { describe, expect, it } from 'vitest'
import { primaryNavigation, workflowRoutes } from '../lib/productNavigation'

describe('individual-first product navigation', () => {
  it('keeps the primary navigation focused on four user-facing destinations', () => {
    expect(primaryNavigation.map((item) => item.label)).toEqual([
      'Dashboard',
      'Campaigns',
      'Phone & SIM',
      'Settings',
    ])
  })

  it('does not expose workflow implementation pages as primary navigation', () => {
    const hrefs = new Set<string>(primaryNavigation.map((item) => item.href))
    expect(hrefs.has(workflowRoutes.recipients)).toBe(false)
    expect(hrefs.has(workflowRoutes.consent)).toBe(false)
    expect(hrefs.has(workflowRoutes.composer)).toBe(false)
  })

  it('keeps primary navigation hrefs unique', () => {
    const hrefs = primaryNavigation.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
