'use client';

import { signup } from '../actions'
import Link from 'next/link'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function SignupPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setError('')

        const res = await signup(formData)
        if (res?.error) {
            setError(res.error)
            setIsLoading(false)
        } else if (res?.success) {
            setSuccess(true)
            setIsLoading(false)
        }
    }

    if (success) {
        return (
            <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-md p-6 text-center">
                    <h2 className="text-2xl font-bold text-green-800 mb-2">
                        Check your email
                    </h2>
                    <p className="text-green-700">
                        We've sent you a confirmation link. Please check your email to verify your account.
                    </p>
                    <div className="mt-6">
                        <Link href="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                            Return to sign in
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                    Create your account
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                        Sign in
                    </Link>
                </p>
            </div>

            <form action={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Email address
                        </label>
                        <div className="mt-1">
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <div className="mt-1">
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm"
                            />
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md border border-red-100">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        'Sign up'
                    )}
                </button>
            </form>
        </div>
    )
}

