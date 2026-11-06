import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/features/auth/user-menu";

const navItems = [
  { to: "/", label: "Início", exact: true },
  { to: "/projects", label: "Projetos", exact: false },
  { to: "/about", label: "Sobre", exact: true },
] as const;

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Link to="/" className="font-semibold tracking-tight">
          Foreman Web
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent text-foreground", "aria-current": "page" }}
              activeOptions={{ exact: item.exact }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
