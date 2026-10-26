"use client";
// A table row that opens its job when clicked anywhere (except on a tick box, link or button).
import { useRouter } from "next/navigation";

export function ClickableRow({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer ${className ?? ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, label, select")) return;
        if (window.getSelection()?.toString()) return;   // selecting text, not opening
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
