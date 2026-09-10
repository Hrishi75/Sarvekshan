import { q } from "@/lib/db";
import { Card, Tag } from "@/components/ui";
import { IconSchool } from "@/components/icons";
import { devSignInEnabled } from "@/lib/session";
import { SignInForm } from "./SignInForm";

// The gate below reads the environment, so it has to run per request. Without
// this the page prerenders at build time and the setting is frozen into it.
export const dynamic = "force-dynamic";

// One code per outcome rather than a message in the query string: the URL is not
// a place to let anything choose what the page says.
const NOTICES: Record<string, { tone: "bad" | "plain"; message: string }> = {
  credentials: {
    tone: "bad",
    message: "That phone number and password do not match.",
  },
  missing: {
    tone: "bad",
    message: "Enter your phone number and your password.",
  },
  locked: {
    tone: "bad",
    message: "Too many wrong attempts. Wait fifteen minutes, or ask your coordinator to reset it.",
  },
  signedout: {
    tone: "plain",
    message: "You are signed out.",
  },
};

/**
 * Sign-in. Password is the credential today and phone OTP is the credential
 * next — the identifier is the phone number either way, so the field worker
 * learns the same thing once.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const notice = e ? NOTICES[e] : undefined;

  return (
    <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4 py-10">
      <div className="mb-[22px] flex flex-col items-center gap-[10px] text-center">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[11px] bg-brand text-white">
          <IconSchool size={22} />
        </span>
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.02em]">Sarvekshan</h1>
          <p className="text-[12.5px] text-mute">School repair register</p>
        </div>
      </div>

      {notice && (
        <div
          role="alert"
          className={`mb-[14px] rounded-[8px] border px-[13px] py-[10px] text-[12.5px] ${
            notice.tone === "bad"
              ? "border-bad/25 bg-bad-soft text-bad"
              : "border-hair bg-surface-2 text-body"
          }`}
        >
          <span className="block font-medium">{notice.message}</span>
        </div>
      )}

      <Card className="px-[18px] py-[20px]">
        <SignInForm />
      </Card>

      <p className="mt-[14px] px-1 text-center text-[12px] leading-[1.55] text-mute">
        Forgot your password? Ask your coordinator to reset it.
      </p>

      {devSignInEnabled() && <DevPicker />}
    </div>
  );
}

/**
 * The development picker: no credential of any kind, and an unauthenticated
 * roster of every user in every org. Never build that list unless the sign-in it
 * feeds is actually enabled — see devSignInEnabled().
 */
async function DevPicker() {
  const users = await q<{
    id: string;
    name: string;
    role: string;
    block: string | null;
    is_local_checker: boolean;
    has_password: boolean;
  }>(
    `SELECT id, name, role, block, is_local_checker, (password_hash IS NOT NULL) AS has_password
       FROM users WHERE active
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'coordinator' THEN 1 ELSE 2 END, name`
  );

  return (
    <div className="mt-[26px] border-t border-hair pt-[18px]">
      <div className="mb-[10px] flex items-center gap-[8px]">
        <span className="eyebrow">Development sign-in</span>
        <span className="h-px grow bg-hair-soft" />
        <Tag tone="warn">no password</Tag>
      </div>
      <p className="mb-[10px] text-[11.5px] leading-[1.5] text-faint">
        Skips the credential entirely. Off in production unless FR_ALLOW_DEV_SIGNIN=1.
      </p>

      <form action="/api/signin" method="post" className="flex flex-col gap-[6px]">
        {users.map((u) => (
          <button key={u.id} name="id" value={u.id} className="text-left" type="submit">
            <Card className="flex items-center justify-between px-[13px] py-[10px] hover:border-brand">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{u.name}</span>
                <span className="block text-[11px] text-faint">
                  {u.block}
                  {!u.has_password && " · no password set"}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                {u.is_local_checker && <Tag tone="good">local checker</Tag>}
                <Tag tone={u.role === "volunteer" ? "plain" : "brand"}>{u.role}</Tag>
              </span>
            </Card>
          </button>
        ))}
        {users.length === 0 && (
          <p className="text-[12.5px] text-mute">
            No users yet. Run <code className="font-mono">npm run seed</code>.
          </p>
        )}
      </form>
    </div>
  );
}
