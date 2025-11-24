"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  BookHeart,
  ShoppingBasket,
  Calendar,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import UserStatus from "./UserStatus";
import { useAuth } from "@/hooks/useAuth";

export default function Navigation() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const isActive = (path: string) => pathname === path;

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center gap-2"
              onClick={closeMobileMenu}
            >
              <ChefHat className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">
                Mise <span className="text-blue-600">AI</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-8 items-center">
            <Link
              href="/about"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive("/about")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
            >
              About
            </Link>
            <Link
              href="/pricing"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive("/pricing")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive("/contact")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
            >
              Contact
            </Link>

            {user && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsToolsOpen(!isToolsOpen)}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors focus:outline-none ${isToolsOpen || ["/generator", "/collection", "/weekly-plan", "/grocery-list"].includes(pathname)
                      ? "border-blue-600 text-gray-900"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                >
                  Tools
                  <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isToolsOpen ? "rotate-180" : ""}`} />
                </button>

                {isToolsOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5 z-50">
                    <Link
                      href="/generator"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      <div className="flex items-center">
                        <ChefHat className="w-4 h-4 mr-2" />
                        Generator
                      </div>
                    </Link>
                    <Link
                      href="/collection"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      <div className="flex items-center">
                        <BookHeart className="w-4 h-4 mr-2" />
                        Collection
                      </div>
                    </Link>
                    <Link
                      href="/weekly-plan"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2" />
                        Weekly Plan
                      </div>
                    </Link>
                    <Link
                      href="/grocery-list"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      <div className="flex items-center">
                        <ShoppingBasket className="w-4 h-4 mr-2" />
                        Grocery List
                      </div>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:block">
              <UserStatus />
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="pt-2 pb-3 space-y-1 px-2 sm:px-3">
            <Link
              href="/about"
              onClick={closeMobileMenu}
              className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/about")
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                }`}
            >
              About
            </Link>
            <Link
              href="/pricing"
              onClick={closeMobileMenu}
              className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/pricing")
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                }`}
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              onClick={closeMobileMenu}
              className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/contact")
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                }`}
            >
              Contact
            </Link>

            {user && (
              <>
                <div className="pt-4 pb-2">
                  <div className="border-t border-gray-200"></div>
                  <p className="px-3 pt-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Tools
                  </p>
                </div>
                <Link
                  href="/generator"
                  onClick={closeMobileMenu}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/generator")
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <div className="flex items-center">
                    <ChefHat className="w-5 h-5 mr-3" />
                    Generator
                  </div>
                </Link>
                <Link
                  href="/collection"
                  onClick={closeMobileMenu}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/collection")
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <div className="flex items-center">
                    <BookHeart className="w-5 h-5 mr-3" />
                    Collection
                  </div>
                </Link>
                <Link
                  href="/weekly-plan"
                  onClick={closeMobileMenu}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/weekly-plan")
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-3" />
                    Weekly Plan
                  </div>
                </Link>
                <Link
                  href="/grocery-list"
                  onClick={closeMobileMenu}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${isActive("/grocery-list")
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <div className="flex items-center">
                    <ShoppingBasket className="w-5 h-5 mr-3" />
                    Grocery List
                  </div>
                </Link>
              </>
            )}
          </div>
          <div className="pt-4 pb-4 border-t border-gray-200 px-4">
            <div className="flex items-center">
              <UserStatus onAction={closeMobileMenu} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}