"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModalShellProps {
  children: ReactNode;
  labelledBy?: string;
  panelClassName?: string;
}

export default function ModalShell({
  children,
  labelledBy,
  panelClassName,
}: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto",
          panelClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
