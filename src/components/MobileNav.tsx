"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  Calendar,
  ShoppingBasket,
  Warehouse,
  BookHeart,
} from "lucide-react";

const tabs = [
  { label: "Generator", icon: ChefHat, href: "/generator" },
  { label: "Weekly", icon: Calendar, href: "/weekly-plan" },
  { label: "Grocery", icon: ShoppingBasket, href: "/grocery-list" },
  { label: "Pantry", icon: Warehouse, href: "/pantry" },
  { label: "Collection", icon: BookHeart, href: "/collection" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="market-mobile-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 pb-safe md:hidden"
    >
      <div className="flex">
        {tabs.map(({ label, icon: Icon, href }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`market-mobile-nav__item flex-1 min-w-0 flex flex-col items-center justify-center py-2.5 min-h-[56px] px-0.5 transition-colors ${
                active ? "text-blue-600" : "text-gray-400"
              }`}
            >
              <div
                className={`market-mobile-nav__icon p-1 rounded-full transition-colors ${
                  active ? "bg-blue-50" : ""
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium mt-0.5 truncate w-full text-center">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
