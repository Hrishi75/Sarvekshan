"use client";

import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

/**
 * Plain form posting to /api/password, so it survives a device where the script
 * never loads. JavaScript only adds the reveal toggle and the length hint.
 */
export function PasswordForm({ needsCurrent }: { needsCurrent: boolean }) {
  const [show, setShow] = useState(false);
  const [next, setNext] = useState("");

  const short = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;

  return (
    <form action="/api/password" method="post" className="flex flex-col gap-[14px]">
      {needsCurrent && (
        <div>
          <label htmlFor="current" className="mb-[6px] block text-[13px] font-medium">
            Current password
          </label>
          <input
            id="current"
            name="current"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            className="tap w-full rounded-[8px] border border-hair bg-surface px-[12px] text-[16px] outline-none focus:border-brand"
          />
        </div>
      )}

      <div>
        <div className="mb-[6px] flex items-baseline justify-between">
          <label htmlFor="next" className="text-[13px] font-medium">
            New password
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
          id="next"
          name="next"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          autoFocus={!needsCurrent}
          minLength={MIN_PASSWORD_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="next-hint"
          className={`tap w-full rounded-[8px] border bg-surface px-[12px] text-[16px] outline-none focus:border-brand ${
            short ? "border-warn" : "border-hair"
          }`}
        />
        <p id="next-hint" className={`mt-[5px] text-[11.5px] ${short ? "text-warn" : "text-faint"}`}>
          At least {MIN_PASSWORD_LENGTH} characters
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-[6px] block text-[13px] font-medium">
          Type it again
        </label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="tap w-full rounded-[8px] border border-hair bg-surface px-[12px] text-[16px] outline-none focus:border-brand"
        />
      </div>

      <button
        type="submit"
        className="tap mt-[2px] w-full rounded-[8px] bg-brand text-[15px] font-semibold text-white active:opacity-90"
      >
        Save password
      </button>
    </form>
  );
}
