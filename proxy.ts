import { NextResponse, type NextRequest } from "next/server";

const LEGACY_TRIBE_PREFIX = "/tribu/";
const LEGACY_CREATE_PATH = "/tribu/crear";
const NEW_CREATE_PATH = "/-/crear";
const ROOT_PATH = "/";
const REDIRECT_STATUS_PERMANENT = 308;

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === LEGACY_CREATE_PATH) {
    const target = request.nextUrl.clone();
    target.pathname = NEW_CREATE_PATH;
    return NextResponse.redirect(target, REDIRECT_STATUS_PERMANENT);
  }

  if (pathname.startsWith(LEGACY_TRIBE_PREFIX)) {
    const target = request.nextUrl.clone();
    target.pathname = ROOT_PATH + pathname.slice(LEGACY_TRIBE_PREFIX.length);
    return NextResponse.redirect(target, REDIRECT_STATUS_PERMANENT);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/tribu/:path*"],
};
