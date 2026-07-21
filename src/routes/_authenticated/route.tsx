import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { me } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await me();
    if (!user) throw redirect({ to: "/login", search: { redirect: location.href } as never });
    return { user };
  },
  component: () => <Outlet />,
});
