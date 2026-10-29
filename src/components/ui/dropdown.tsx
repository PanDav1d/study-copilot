"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dropdown({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-md border bg-background p-1 shadow-md"
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent [&_svg]:text-muted-foreground",
        danger && "text-danger",
      )}
    >
      {icon}
      {children}
    </Menu.Item>
  );
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />;
}
