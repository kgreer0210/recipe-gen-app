import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    // if "next" is in param, use it as the redirect URL after a successful exchange
    const next = searchParams.get('next') ?? '/generator'

    const supabase = await createClient()

    let exchangeError: unknown = null

    if (code) {
        // PKCE flow: OAuth, magic links, and email confirmations sent with emailRedirectTo
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        exchangeError = error
    } else if (token_hash && type) {
        // Email OTP flow: default Supabase confirmation templates using token_hash
        const { error } = await supabase.auth.verifyOtp({ type, token_hash })
        exchangeError = error
    } else {
        exchangeError = new Error('Missing auth code or token_hash')
    }

    if (!exchangeError) {
        const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
        const isLocalEnv = process.env.NODE_ENV === 'development'
        if (isLocalEnv) {
            // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
            return NextResponse.redirect(`${origin}${next}`)
        } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${next}`)
        } else {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Exchange failed (or no credentials present) — send the user back to login.
    return NextResponse.redirect(`${origin}/login?error=confirmation_failed`)
}
