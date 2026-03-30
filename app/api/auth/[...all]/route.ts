import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/src/modules/auth/infrastructure/better-auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
