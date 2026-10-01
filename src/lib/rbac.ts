export const organizationRoles = ['owner', 'admin', 'campaign_manager', 'analyst', 'billing'] as const
export type OrganizationRole = (typeof organizationRoles)[number]

export const inviteableRoles = ['admin', 'campaign_manager', 'analyst', 'billing'] as const
export type InviteableRole = (typeof inviteableRoles)[number]

export const roleLabels: Record<OrganizationRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  campaign_manager: 'Campaign Manager',
  analyst: 'Analyst',
  billing: 'Billing',
}

export function canManageOrganization(role: OrganizationRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function canManageCampaigns(role: OrganizationRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'campaign_manager'
}

export function canViewReports(role: OrganizationRole | null | undefined): boolean {
  return role !== null && role !== undefined
}

export function canManageBilling(role: OrganizationRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'billing'
}
