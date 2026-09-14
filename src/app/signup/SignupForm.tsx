"use client";

import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

export function SignupForm() {
  const [show, setShow] = useState(false);

  return (
    <form action="/api/signup" method="post" className="flex flex-col gap-4">
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium">Phone number</label>
        <div className="flex min-h-[50px] overflow-hidden rounded-[8px] border border-hair bg-surface focus-within:border-brand">
          <span className="num flex items-center border-r border-hair px-3 text-[14px] text-mute">+91</span>
          <input id="phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel" autoFocus required maxLength={14} placeholder="98765 43210" className="num min-w-0 grow bg-transparent px-3 text-[16px] outline-none placeholder:text-faint" />
        </div>
      </div>

      <div>
        <label htmlFor="code" className="mb-1.5 block text-[13px] font-medium">Invitation code</label>
        <input id="code" name="code" inputMode="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required maxLength={12} placeholder="ABCD-EFGH" className="num min-h-[50px] w-full rounded-[8px] border border-hair bg-surface px-3 text-[16px] uppercase tracking-[0.12em] outline-none placeholder:tracking-[0.08em] placeholder:text-faint focus:border-brand" />
        <p className="mt-1.5 text-[11.5px] leading-[1.45] text-faint">Use the one-time code your coordinator gave you.</p>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="password" className="text-[13px] font-medium">Create a password</label>
          <button type="button" onClick={() => setShow((value) => !value)} className="text-[11.5px] font-medium text-brand">{show ? "Hide" : "Show"}</button>
        </div>
        <input id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} aria-describedby="password-hint" className="min-h-[50px] w-full rounded-[8px] border border-hair bg-surface px-3 text-[16px] outline-none focus:border-brand" />
        <p id="password-hint" className="mt-1.5 text-[11.5px] text-faint">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-[13px] font-medium">Confirm password</label>
        <input id="confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} className="min-h-[50px] w-full rounded-[8px] border border-hair bg-surface px-3 text-[16px] outline-none focus:border-brand" />
      </div>

      <button type="submit" className="tap mt-1 w-full rounded-[8px] bg-brand text-[15px] font-semibold text-white hover:opacity-90">Activate account</button>
    </form>
  );
}
