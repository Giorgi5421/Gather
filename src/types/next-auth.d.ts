import "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & NonNullable<DefaultSession["user"]>;
  }
  interface User {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
