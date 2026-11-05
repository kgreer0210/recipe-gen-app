import { NextResponse } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/safeNextPath'
import { CALLBACK_ERROR } from '@/lib/auth/loginNotice'

// A bare host (optionally with a port). Anything else in x-forwarded-host is ignored.
const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$/

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as EmailOtpType | null
    // "next" is where to go after a successful exchange. Only a same-origin
    // relative path is accepted; anything else falls back to /generator.
    const next = safeNextPath(searchParams.get('next'), origin)

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
        } else if (forwardedHost && HOST_PATTERN.test(forwardedHost)) {
            return NextResponse.redirect(`https://${forwardedHost}${next}`)
        } else {
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // Exchange failed (or no credentials present) — send the user back to login
    // with a fixed error code the login page turns into a friendly message.
    const failure =
        type === 'invite' ? CALLBACK_ERROR.inviteExpired
        : type === 'recovery' ? CALLBACK_ERROR.resetExpired
        : CALLBACK_ERROR.generic
    return NextResponse.redirect(`${origin}/login?error=${failure}`)
}
