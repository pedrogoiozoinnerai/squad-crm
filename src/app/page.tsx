import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { allowedDomain, getSessionUser, homeFor } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  return <LoginForm domain={allowedDomain()} />;
}
