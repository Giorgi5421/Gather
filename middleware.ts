import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const onLogin = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/reset-password";
  if (!token && !onLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (token && onLogin) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };
