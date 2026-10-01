import { describe, expect, it } from 'vitest'
import { canManageBilling, canManageCampaigns, canManageOrganization, canViewReports } from '../lib/rbac'

describe('organization RBAC helpers', () => {
  it('limits organization administration to owners and admins', () => {
    expect(canManageOrganization('owner')).toBe(true)
    expect(canManageOrganization('admin')).toBe(true)
    expect(canManageOrganization('campaign_manager')).toBe(false)
    expect(canManageOrganization('analyst')).toBe(false)
    expect(canManageOrganization('billing')).toBe(false)
  })

  it('allows campaign managers to manage campaigns but not billing', () => {
    expect(canManageCampaigns('campaign_manager')).toBe(true)
    expect(canManageBilling('campaign_manager')).toBe(false)
  })

  it('allows billing role to manage billing and every member to view reports', () => {
    expect(canManageBilling('billing')).toBe(true)
    expect(canViewReports('billing')).toBe(true)
    expect(canViewReports(null)).toBe(false)
  })
})
