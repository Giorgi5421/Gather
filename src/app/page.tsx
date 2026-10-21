import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SocialApp } from "@/components/social-app";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <SocialApp user={{ id: session.user.id, name: session.user.name ?? "Member", image: session.user.image }} />;
}
