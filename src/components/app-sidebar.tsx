import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, History, Users, Wallet, Code2 } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const adminItems = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard },
  { title: "Depósitos", url: "/app/depositos", icon: ArrowDownToLine },
  { title: "Saques", url: "/app/saques", icon: ArrowUpFromLine },
  { title: "Histórico", url: "/app/historico", icon: History },
  { title: "Funcionários", url: "/app/funcionarios", icon: Users },
  { title: "API & Docs", url: "/app/api", icon: Code2 },
];

const employeeItems = [
  { title: "Meus recebimentos", url: "/app/meus-recebimentos", icon: Wallet },
  { title: "Depósitos", url: "/app/depositos", icon: ArrowDownToLine },
  { title: "Saques", url: "/app/saques", icon: ArrowUpFromLine },
  { title: "Histórico", url: "/app/historico", icon: History },
  { title: "API & Docs", url: "/app/api", icon: Code2 },
];

export function AppSidebar({ role }: { role: "admin" | "funcionario" | "cliente" }) {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { isMobile, setOpenMobile } = useSidebar();
  const items = role === "admin" ? adminItems : employeeItems;
  const isActive = (path: string) => currentPath === path;
  const handleNav = () => { if (isMobile) setOpenMobile(false); };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src="/lynx-logo.png" alt="Lynx Wallet" className="h-7 w-7 object-contain" />
          </div>
          <span className="font-display font-bold text-base group-data-[collapsible=icon]:hidden">Lynx Wallet</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{role === "admin" ? "Painel" : "Área pessoal"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link to={item.url} onClick={handleNav}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
