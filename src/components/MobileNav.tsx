"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, Calendar, ShoppingBasket, BookHeart } from "lucide-react";

const tabs = [
  { label: "Generator", icon: ChefHat, href: "/generator" },
  { label: "Weekly", icon: Calendar, href: "/weekly-plan" },
  { label: "Grocery", icon: ShoppingBasket, href: "/grocery-list" },
  { label: "Collection", icon: BookHeart, href: "/collection" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 pb-safe md:hidden">
      <div className="flex">
        {tabs.map(({ label, icon: Icon, href }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] transition-colors ${
                active ? "text-blue-600" : "text-gray-400"
              }`}
            >
              <div
                className={`p-1 rounded-full transition-colors ${
                  active ? "bg-blue-50" : ""
                }`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-medium mt-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
