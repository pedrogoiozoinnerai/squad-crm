import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { allowedDomain, getSessionUser, homeFor } from "@/lib/auth";
import { googleConfigurado } from "@/lib/google";

export default async function LoginPage(props: PageProps<"/">) {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));

  const { erro } = await props.searchParams;

  return (
    <LoginForm
      domain={allowedDomain()}
      googleAtivo={googleConfigurado()}
      erroSso={Array.isArray(erro) ? erro[0] : erro}
    />
  );
}
