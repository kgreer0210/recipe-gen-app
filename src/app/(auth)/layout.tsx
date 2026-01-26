import Link from "next/link";
import { ChefHat, Heart } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-black text-white flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern/overlay */}
        <div className="absolute inset-0 opacity-30 bg-[url('/kitchen-background.jpg')] bg-cover bg-center"></div>

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2 text-white">
            <ChefHat className="w-8 h-8" />
            <span className="text-2xl font-bold">Mise AI</span>
          </Link>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="text-5xl font-bold mb-8 leading-tight">
            Cooking shouldn't feel like a chore.
          </h1>
          <div className="flex items-center gap-4 text-blue-100">
            <Heart className="w-6 h-6" />
            <p className="text-xl">
              Join other home cooks that are simplifying their grocery shopping.
            </p>
          </div>
        </div>

        <div className="relative z-10 text-sm text-blue-200">
          © {new Date().getFullYear()} Mise AI. All rights reserved.
        </div>
      </div>

      {/* Right Panel - Form Content */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-white lg:bg-gray-50">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="lg:hidden mb-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-blue-600"
            >
              <ChefHat className="w-8 h-8" />
              <span className="text-2xl font-bold text-gray-900">
                Mise <span className="text-blue-600">AI</span>
              </span>
            </Link>
            <p className="mt-2 text-sm text-gray-600">
              Cooking shouldn't feel like a chore.
            </p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
