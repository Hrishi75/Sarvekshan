import { currentUser, sessionMustChangePassword } from "@/lib/session";
import { tx } from "@/lib/db";
import { teamInput } from "@/lib/team-input";
import { manageTeam, TeamError } from "@/lib/team";
import { isSameOriginRequest } from "@/lib/request-origin";

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return response({ error: "Sign in before managing the team." }, 401);
  if (user.role === "volunteer" || await sessionMustChangePassword()) {
    return response({ error: "Sign in with your own coordinator or admin password to manage the team." }, 403);
  }
  // These actions mint credentials. Require a same-origin browser submission.
  if (!isSameOriginRequest(request)) {
    return response({ error: "Open Team in this app and try again." }, 403);
  }
  const input = teamInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return response({ error: input.error.issues[0].message }, 400);

  try {
    const result = await tx((c) => manageTeam(c, user, input.data));
    return response(result, input.data.action === "invite" ? 201 : 200);
  } catch (error) {
    if (error instanceof TeamError) return response({ error: error.message }, error.status);
    // Do not log request bodies, SQL parameters, or minted credentials.
    console.error("Team management failed");
    return response({ error: "Could not update this account. Reload the team list before trying again." }, 500);
  }
}
