import Link from 'next/link'

export default function SignupPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                    Mise AI is invite-only
                </h2>
                <p className="mt-4 text-sm text-gray-600">
                    Mise AI is a private kitchen, so there is no public sign-up. If you were invited,
                    check your email for the invite link and follow it to set up your account.
                </p>
                <p className="mt-4 text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    )
}
