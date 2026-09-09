import Link from "next/link";
import { redirect } from "next/navigation";
import { q1 } from "@/lib/db";
import { Card } from "@/components/ui";
import { IconLock } from "@/components/icons";
import { currentUser, sessionMustChangePassword } from "@/lib/session";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "bad" | "good"; en: string; hi: string }> = {
  "wrong-current": {
    tone: "bad",
    en: "That is not your current password.",
    hi: "मौजूदा पासवर्ड ग़लत है।",
  },
  mismatch: {
    tone: "bad",
    en: "The two new passwords are not the same.",
    hi: "दोनों नए पासवर्ड एक जैसे नहीं हैं।",
  },
  weak: {
    tone: "bad",
    en: "Use at least ten characters.",
    hi: "कम से कम दस अक्षर इस्तेमाल करें।",
  },
  same: {
    tone: "bad",
    en: "That is the password you already have. Choose a different one.",
    hi: "यह वही पुराना पासवर्ड है। कोई दूसरा चुनें।",
  },
  changed: {
    tone: "good",
    en: "Password changed. Use it the next time you sign in.",
    hi: "पासवर्ड बदल गया। अगली बार साइन इन करते समय यही इस्तेमाल करें।",
  },
};

/**
 * Choose a password. Reached on purpose from the sidebar, and unavoidably right
 * after signing in on a temp password — see proxy.ts, which holds a must-change
 * session on this page until it has one.
 */
export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/signin");

  const { e } = await searchParams;
  const notice = e ? NOTICES[e] : undefined;
  const forced = await sessionMustChangePassword();

  const row = await q1<{ has_password: boolean }>(
    `SELECT (password_hash IS NOT NULL) AS has_password FROM users WHERE id = $1`,
    [user.id]
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
      <div className="mb-[20px] flex flex-col items-center gap-[10px] text-center">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] bg-brand-soft text-brand">
          <IconLock size={21} />
        </span>
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.02em]">
            {forced ? "Choose your password" : "Change your password"}
          </h1>
          <p className="text-[12.5px] text-mute">
            {user.name} · {forced ? "अपना पासवर्ड चुनें" : "पासवर्ड बदलें"}
          </p>
        </div>
      </div>

      {forced && !notice && (
        <div className="mb-[14px] rounded-[8px] border border-warn/25 bg-warn-soft px-[13px] py-[10px] text-[12.5px] text-warn">
          <span className="block font-medium">
            You signed in with a temporary password. Choose your own before you go on.
          </span>
          <span className="block opacity-80">
            आपने अस्थायी पासवर्ड से साइन इन किया है। आगे बढ़ने से पहले अपना पासवर्ड चुनें।
          </span>
        </div>
      )}

      {notice && (
        <div
          role="alert"
          className={`mb-[14px] rounded-[8px] border px-[13px] py-[10px] text-[12.5px] ${
            notice.tone === "bad"
              ? "border-bad/25 bg-bad-soft text-bad"
              : "border-good/25 bg-good-soft text-good"
          }`}
        >
          <span className="block font-medium">{notice.en}</span>
          <span className="block opacity-80">{notice.hi}</span>
        </div>
      )}

      {e === "changed" ? (
        <Link
          href="/"
          className="tap flex w-full items-center justify-center rounded-[8px] bg-brand text-[15px] font-semibold text-white"
        >
          Continue <span className="ml-1 font-medium opacity-80">आगे बढ़ें</span>
        </Link>
      ) : (
        <>
          <Card className="px-[18px] py-[20px]">
            <PasswordForm needsCurrent={row?.has_password ?? false} />
          </Card>
          {!forced && (
            <Link
              href="/"
              className="mt-[14px] text-center text-[12.5px] font-medium text-mute hover:text-body"
            >
              Back without changing it
            </Link>
          )}
        </>
      )}
    </div>
  );
}
