"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintLabelButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="gap-1.5">
      <Printer className="h-4 w-4" />
      Yazdır
    </Button>
  );
}
