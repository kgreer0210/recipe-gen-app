"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  BookHeart,
  ShoppingBasket,
  Calendar,
  Menu,
  X,
} from "lucide-react";
import UserStatus from "./UserStatus";

export default function Navigation() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

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
                CookList <span className="text-blue-600">AI</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-8">
            <Link
              href="/"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                isActive("/")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <ChefHat className="w-4 h-4 mr-2" />
              Generator
            </Link>
            <Link
              href="/collection"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                isActive("/collection")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <BookHeart className="w-4 h-4 mr-2" />
              Collection
            </Link>
            <Link
              href="/weekly-plan"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                isActive("/weekly-plan")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <Calendar className="w-4 h-4 mr-2" />
              Weekly Plan
            </Link>
            <Link
              href="/grocery-list"
              className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                isActive("/grocery-list")
                  ? "border-blue-600 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <ShoppingBasket className="w-4 h-4 mr-2" />
              Grocery List
            </Link>
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
              href="/"
              onClick={closeMobileMenu}
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                isActive("/")
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
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                isActive("/collection")
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
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                isActive("/weekly-plan")
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
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                isActive("/grocery-list")
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <div className="flex items-center">
                <ShoppingBasket className="w-5 h-5 mr-3" />
                Grocery List
              </div>
            </Link>
          </div>
          <div className="pt-4 pb-4 border-t border-gray-200 px-4">
            <div className="flex items-center">
              <UserStatus />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
