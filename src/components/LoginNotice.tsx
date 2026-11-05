"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loginNoticeMessage } from "@/lib/auth/loginNotice";

function LoginNoticeMessage() {
  const searchParams = useSearchParams();
  const message = loginNoticeMessage({
    error: searchParams.get("error"),
    error_code: searchParams.get("error_code"),
  });

  if (!message) return null;

  return (
    <div
      role="status"
      className="text-amber-800 text-sm bg-amber-50 p-3 rounded-md border border-amber-200"
    >
      {message}
    </div>
  );
}

export default function LoginNotice() {
  return (
    <Suspense fallback={null}>
      <LoginNoticeMessage />
    </Suspense>
  );
}
