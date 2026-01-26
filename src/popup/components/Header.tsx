import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  trailing?: ReactNode;
}

export function Header({ title, trailing }: HeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <img src="/icons/ethui-black.svg" alt="ethui" className="h-5 w-5" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      {trailing}
    </div>
  );
}
