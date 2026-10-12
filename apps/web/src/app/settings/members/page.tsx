import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MembersScreen } from "@/components/members/members-screen";
import { PageTitle } from "@/components/page-title";
import { getSessionUser } from "@/lib/auth/session";

async function MembersGate() {
  const user = await getSessionUser(await headers());
  if (!user?.isAdmin) redirect("/settings");
  return <MembersScreen />;
}

export default function Page() {
  return (
    <>
      <PageTitle title="Members - WCAG Auditor" />
      <Suspense fallback={null}>
        <MembersGate />
      </Suspense>
    </>
  );
}
