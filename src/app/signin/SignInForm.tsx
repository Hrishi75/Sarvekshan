"use client";

import { useState } from "react";

/**
 * A plain form posting to /api/signin — no fetch, no onSubmit — so it still
 * works on a device where the script never arrives. The only thing JavaScript
 * adds is the reveal toggle, which matters when you are typing a password
 * someone read to you over a bad line, outdoors, one-handed.
 */
export function SignInForm() {
  const [show, setShow] = useState(false);

  return (
    <form action="/api/signin" method="post" className="flex flex-col gap-[14px]">
      <div>
        <label htmlFor="phone" className="mb-[6px] block text-[13px] font-medium">
          Phone number
        </label>
        <div className="flex items-center gap-0 overflow-hidden rounded-[8px] border border-hair bg-surface focus-within:border-brand">
          <span className="num shrink-0 border-r border-hair px-[11px] py-[14px] text-[15px] text-mute">
            +91
          </span>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            autoFocus
            required
            maxLength={14}
            placeholder="98765 43210"
            aria-describedby="phone-hint"
            className="num tap w-full bg-transparent px-[12px] text-[16px] tracking-[0.02em] outline-none placeholder:text-faint placeholder:tracking-normal"
          />
        </div>
        <p id="phone-hint" className="mt-[5px] text-[11.5px] text-faint">
          The number your coordinator registered you with.
        </p>
      </div>

      <div>
        <div className="mb-[6px] flex items-baseline justify-between">
          <label htmlFor="password" className="text-[13px] font-medium">
            Password
          </label>
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-[11.5px] font-medium text-brand"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          className="tap w-full rounded-[8px] border border-hair bg-surface px-[12px] text-[16px] outline-none focus:border-brand"
        />
      </div>

      <button
        type="submit"
        className="tap mt-[2px] w-full rounded-[8px] bg-brand text-[15px] font-semibold text-white active:opacity-90"
      >
        Sign in
      </button>
    </form>
  );
}
