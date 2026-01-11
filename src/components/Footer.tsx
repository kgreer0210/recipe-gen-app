import React from "react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-sm text-gray-600">
          <p>
            Built and managed by{" "}
            <a
              href="https://www.kygrsolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-gray-900 hover:underline"
            >
              KYGR Solutions
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

