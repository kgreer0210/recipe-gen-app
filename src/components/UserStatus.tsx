'use client';

import { createClient } from '@/lib/supabase/client';
import { useStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UserStatus() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const { fetchData } = useStore();
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
                fetchData(); // Trigger data fetch when user is found
            }
            setLoading(false);
        };

        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                setUser(session.user);
                fetchData();
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [fetchData, supabase]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        router.refresh();
    };

    if (loading) {
        return <div className="h-8 w-20 bg-gray-100 animate-pulse rounded-md"></div>;
    }

    if (!user) {
        return (
            <Link
                href="/login"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
                Sign In
            </Link>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-700">
                <UserIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{user.email}</span>
            </div>
            <button
                onClick={handleSignOut}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Sign Out"
            >
                <LogOut className="w-4 h-4" />
            </button>
        </div>
    );
}
