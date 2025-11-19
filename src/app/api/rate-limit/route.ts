import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // We need to check the rate limit status without incrementing it.
        // We can query the table directly using the admin client (since RLS might block reading other fields if we were strict, 
        // but we added a policy for users to read their own. So we could use standard client too.
        // However, to be consistent with the "reset logic" which is in the RPC or needs to be replicated,
        // let's just query the table and replicate the reset logic here for display purposes.

        // Actually, the RPC `check_and_increment` does the reset. If we just read, we might see old data.
        // But `user_rate_limits` has `last_reset`.

        const admin = createAdminClient();
        const { data: rateLimit, error } = await admin
            .from('user_rate_limits')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Error fetching rate limit:', error);
            return NextResponse.json({ error: 'Failed to fetch rate limit' }, { status: 500 });
        }

        const limit = 5; // Hardcoded for now, ideally shared constant
        let count = 0;

        if (rateLimit) {
            const lastReset = new Date(rateLimit.last_reset);
            const now = new Date();
            const oneDay = 24 * 60 * 60 * 1000;

            if (now.getTime() - lastReset.getTime() > oneDay) {
                count = 0;
            } else {
                count = rateLimit.count;
            }
        }

        const remaining = Math.max(0, limit - count);
        const isBlocked = remaining === 0;

        return NextResponse.json({
            remaining,
            limit,
            isBlocked
        });

    } catch (error) {
        console.error('Error in rate-limit API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
