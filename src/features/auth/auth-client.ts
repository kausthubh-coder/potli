import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "./auth";

// inferAdditionalFields types `session.user.username` on the client.
export const authClient = createAuthClient({ plugins: [inferAdditionalFields<typeof auth>()] });
