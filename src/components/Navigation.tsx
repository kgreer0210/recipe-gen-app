'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, BookHeart, ShoppingBasket } from 'lucide-react';
import UserStatus from './UserStatus';

export default function Navigation() {
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path;

    return (
        <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" className="flex items-center gap-2">
                            <ChefHat className="w-8 h-8 text-blue-600" />
                            <span className="text-xl font-bold text-gray-900">Chef <span className="text-blue-600">Genie</span></span>
                        </Link>
                    </div>

                    <div className="flex space-x-8">
                        <Link
                            href="/"
                            className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive('/')
                                ? 'border-blue-600 text-gray-900'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                        >
                            <ChefHat className="w-4 h-4 mr-2" />
                            Generator
                        </Link>
                        <Link
                            href="/collection"
                            className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive('/collection')
                                ? 'border-blue-600 text-gray-900'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                        >
                            <BookHeart className="w-4 h-4 mr-2" />
                            Collection
                        </Link>
                        <Link
                            href="/grocery-list"
                            className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${isActive('/grocery-list')
                                ? 'border-blue-600 text-gray-900'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                        >
                            <ShoppingBasket className="w-4 h-4 mr-2" />
                            Grocery List
                        </Link>
                    </div>

                    <div className="flex items-center">
                        <UserStatus />
                    </div>
                </div>
            </div>
        </nav>
    );
}
