'use client';

import { resetPassword } from '../actions'
import Link from 'next/link'
import { useState } from 'react'
import { Loader2, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    async function handleSubmit(formData: FormData) {
        setIsLoading(true)
        setError('')
        setMessage('')
        
        const res = await resetPassword(formData)
        
        if (res?.error) {
            setError(res.error)
        } else if (res?.success) {
            setMessage(res.success)
        }
        
        setIsLoading(false)
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                    Reset your password
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                    Enter your email address and we'll send you a link to reset your password.
                </p>
            </div>

            <form action={handleSubmit} className="space-y-6">
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
                            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                    </div>
                </div>

                {message && (
                    <div className="text-green-600 text-sm bg-green-50 p-3 rounded-md border border-green-100">
                        {message}
                    </div>
                )}

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
                        'Send Reset Link'
                    )}
                </button>

                <div className="flex items-center justify-center">
                    <Link href="/login" className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to sign in
                    </Link>
                </div>
            </form>
        </div>
    )
}

