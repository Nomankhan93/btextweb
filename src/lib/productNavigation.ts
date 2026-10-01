export const primaryNavigation = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Phone & SIM', href: '/devices' },
  { label: 'Settings', href: '/settings' },
] as const

export const workflowRoutes = {
  recipients: '/imports',
  consent: '/consent-suppression',
  composer: '/composer',
} as const
