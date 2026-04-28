import { LayoutDashboard, Settings, LogOut, Video } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

const items = [
  {
    title: "Tạo Video",
    url: "/",
    icon: Video,
  },
  {
    title: "Kho Video",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Cài đặt",
    url: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const { logout, user } = useAuth()
  const location = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex items-center justify-center py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <Video className="h-5 w-5" />
        </div>
        <span className="ml-2 font-bold group-data-[collapsible=icon]:hidden">AutoClip AI</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chế độ</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                    render={<Link to={item.url} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="User Info" className="h-12">
               <div className="flex flex-col items-start text-xs group-data-[collapsible=icon]:hidden">
                 <span className="font-semibold">{user?.username}</span>
                 <span className="text-muted-foreground">{user?.email}</span>
               </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton variant="outline" onClick={logout} className="text-destructive hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Đăng xuất</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
