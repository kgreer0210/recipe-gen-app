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

      {/* Form Side */}
      <div className="bg-white shadow-lg border border-gray-100 rounded-2xl p-8 lg:p-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Send a message
        </h2>
        <ContactForm />
      </div>
    </div>
  );
}
