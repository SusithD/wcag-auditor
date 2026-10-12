import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/login-screen";
import { PageTitle } from "@/components/page-title";
import { safeNext } from "@/lib/auth/access";
import { enabledProviders, resetByEmailEnabled } from "@/lib/auth/policy";
import { getSessionUser } from "@/lib/auth/session";

async function LoginLoader({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const query = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const next = safeNext(first(query.next));
  const user = await getSessionUser(await headers());
  if (user) redirect(next);
  return (
    <LoginScreen
      providers={enabledProviders(process.env)}
      resetEnabled={resetByEmailEnabled(process.env)}
      next={next}
      error={first(query.error) ?? ""}
      invite={first(query.invite) ?? ""}
    />
  );
}

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <PageTitle title="Sign in - WCAG Auditor" />
      <Suspense fallback={null}>
        <LoginLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}
