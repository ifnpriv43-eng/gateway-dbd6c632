import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { logout } from "@/lib/auth.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const logoutFn = useServerFn(logout);

  async function handleLogout() {
    await logoutFn();
    window.localStorage.removeItem("evopay-session-token");
    toast.success("Sessão encerrada");
    await router.invalidate();
    router.navigate({ to: "/login" });
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar role={user.role} />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="h-16 flex items-center justify-between gap-3 border-b border-border px-3 md:px-5 sticky top-0 bg-background/80 backdrop-blur z-10">
            <div className="flex items-center gap-3 min-w-0">
              <MenuToggle />
              <div className="hidden sm:block text-sm text-muted-foreground truncate">
                <span className="text-foreground font-medium">{user.name}</span>
                <span className="mx-2">·</span>
                <span className="capitalize">{user.role}</span>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              size="sm"
              className="group h-9 rounded-full px-3 md:px-4 border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <LogOut className="h-4 w-4 md:mr-2 transition-transform group-hover:translate-x-0.5" />
              <span className="hidden md:inline font-medium">Sair</span>
            </Button>
          </header>
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function MenuToggle() {
  const { toggleSidebar, open, openMobile, isMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
      aria-expanded={isOpen}
      className="group relative inline-flex h-10 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-3.5 text-primary shadow-sm shadow-primary/10 transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-primary/30 active:scale-95"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 group-hover:bg-primary-foreground/20 transition-colors">
        {isOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider">Menu</span>
    </button>
  );
}
