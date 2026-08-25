import { q } from "@/lib/db";
import { Card, Tag } from "@/components/ui";
import { FieldShell } from "@/components/FieldShell";

/**
 * Development sign-in. P1 replaces this with phone OTP;
 * everything downstream reads the same SessionUser shape.
 */
export default async function SignIn() {
  const users = await q<{
    id: string;
    name: string;
    role: string;
    block: string | null;
    is_local_checker: boolean;
  }>(
    `SELECT id, name, role, block, is_local_checker FROM users WHERE active
     ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'coordinator' THEN 1 ELSE 2 END, name`
  );

  return (
    <FieldShell title="Sign in" subtitle="Development mode — pick a user">
      <form action="/api/signin" method="post" className="flex flex-col gap-2">
        {users.map((u) => (
          <button
            key={u.id}
            name="id"
            value={u.id}
            className="text-left"
            type="submit"
          >
            <Card className="flex items-center justify-between px-4 py-3 hover:border-brand">
              <span>
                <span className="block font-semibold">{u.name}</span>
                <span className="block text-xs text-mute">{u.block}</span>
              </span>
              <span className="flex gap-1">
                {u.is_local_checker && <Tag tone="good">local checker</Tag>}
                <Tag tone={u.role === "volunteer" ? "plain" : "brand"}>{u.role}</Tag>
              </span>
            </Card>
          </button>
        ))}
        {users.length === 0 && (
          <p className="text-sm text-mute">
            No users yet. Run <code className="font-mono">npm run seed</code>.
          </p>
        )}
      </form>
    </FieldShell>
  );
}
