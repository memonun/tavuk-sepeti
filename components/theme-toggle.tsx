"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      {/* base-ui uses a render prop instead of asChild. The Button receives
          the trigger's a11y props automatically. */}
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="Tema değiştir" />}
      >
        {/* Sun is visible in light mode, moon in dark — Tailwind's dark:
            variant swaps them via the .dark class on <html>. */}
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Açık</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Koyu</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>Sistem</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
