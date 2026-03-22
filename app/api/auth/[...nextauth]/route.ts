import NextAuth from "next-auth";

import { authOptions } from "@/src/modules/auth/infrastructure/next-auth/auth-options";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
