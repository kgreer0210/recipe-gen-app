import React from "react";
import { Mail } from "lucide-react";
import ContactForm from "@/components/ContactForm";

export default function ContactPage() {
  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl mb-4">
          Get in Touch
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          Have a question, found a bug, or want to suggest a new feature?
          I&apos;d love to hear from you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        {/* Contact Info Side */}
        <div className="bg-blue-50 rounded-2xl p-8 lg:p-12 h-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            We love feedback
          </h2>
          <div className="prose prose-blue text-gray-600 mb-8">
            <p>
              Whether you&apos;re a long-time home cook or just starting to plan
              your meals, your feedback helps shape the future of this app.
            </p>
            <p>
              We read every message and try to respond as quickly as possible.
              Usually within 24-48 hours.
            </p>
          </div>

          <div className="flex flex-col space-y-6">
            <div className="flex items-center space-x-4 text-gray-900">
              <div className="bg-white p-3 rounded-full shadow-sm">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Email us directly
                </p>
                <a
                  href="mailto:kylegreer@kygrsolutions.com"
                  className="text-lg font-semibold hover:text-blue-600 transition-colors"
                >
                  kylegreer@kygrsolutions.com
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Form Side */}
        <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-8 lg:p-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Send a message
          </h2>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
