import { Button } from "@ethui/ui/components/shadcn/button";
import { ArrowLeft, Maximize2, Settings } from "lucide-react";
import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  trailing?: ReactNode;
  devMode?: boolean;
  onBack?: () => void;
  onExpand?: () => void;
  onSettings?: () => void;
}

export function Header({
  title,
  trailing,
  devMode,
  onBack,
  onExpand,
  onSettings,
}: HeaderProps) {
  const iconColor = devMode ? "purple" : "black";

  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <img
          src={`/icons/ethui-${iconColor}.svg`}
          alt="ethui"
          className="h-5 w-5"
        />
        <span className="font-medium text-sm">{title}</span>
        {trailing}
      </div>
      <div className="flex items-center gap-1">
        {onSettings && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onSettings}
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        {onExpand && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onExpand}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
