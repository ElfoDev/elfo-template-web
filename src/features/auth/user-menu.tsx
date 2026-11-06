import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FolderOpen, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionQueryOptions } from "./api";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""))
    .toUpperCase()
    .slice(0, 2);
}

/** Canto direito do header: menu do usuário logado ou "Entrar"/"Criar conta". */
export function UserMenu() {
  const session = useQuery({ ...sessionQueryOptions(), meta: { silent: true } });

  if (session.isPending) {
    return <Skeleton className="h-8 w-24" aria-hidden />;
  }

  if (!session.data) {
    return (
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link to="/login">Entrar</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/signup">Criar conta</Link>
        </Button>
      </div>
    );
  }

  const { user } = session.data;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Menu de ${user.name}`}>
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full bg-primary font-medium text-[0.625rem] text-primary-foreground"
          >
            {initials(user.name || user.email)}
          </span>
          <span className="hidden max-w-40 truncate sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate">{user.name}</p>
          <p className="truncate font-normal text-muted-foreground text-xs">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/projects">
            <FolderOpen aria-hidden />
            Meus projetos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/logout">
            <LogOut aria-hidden />
            Sair
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
