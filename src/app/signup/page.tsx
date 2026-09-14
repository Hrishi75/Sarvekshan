import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { currentUser } from "@/lib/session";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Activate account | Sarvekshan",
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, string> = {
  missing: "Enter your phone number, invitation code, and password.",
  invalid: "That invitation is invalid, expired, or has already been used. Ask your coordinator for a new code.",
  mismatch: "The two passwords are not the same.",
  weak: "Use a password with at least ten characters.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await currentUser()) redirect("/");
  const { e } = await searchParams;
  const notice = e ? NOTICES[e] : undefined;

  return (
    <AuthShell>
      <p className="page-kicker">First-time setup</p>
      <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Activate your account</h1>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-mute">Your coordinator registers your phone number first. Use the invitation once, then sign in with the password you choose.</p>

      {notice && <div role="alert" className="mt-5 rounded-[8px] border border-bad/25 bg-bad-soft px-3.5 py-3 text-[12.5px] font-medium leading-[1.45] text-bad">{notice}</div>}

      <div className="mt-6"><SignupForm /></div>

      <p className="mt-6 border-t border-hair-soft pt-5 text-center text-[12.5px] text-mute">
        Already activated? <Link href="/signin" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
