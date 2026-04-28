import { type LucideIcon } from 'lucide-react'

export interface User {
  name: string
  email: string
  avatar: string
}

export interface Team {
  name: string
  logo: LucideIcon | React.ForwardRefExoticComponent<any>
  plan: string
}

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon | React.ForwardRefExoticComponent<any>
  isActive?: boolean
  items?: {
    title: string
    url: string
  }[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export interface SidebarData {
  user: User
  teams: Team[]
  navGroups: NavGroup[]
}
