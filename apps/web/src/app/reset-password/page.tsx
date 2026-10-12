import { Suspense } from "react";
import { ResetScreen } from "@/components/auth/reset-screen";
import { PageTitle } from "@/components/page-title";

async function ResetLoader({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <ResetScreen token={Array.isArray(token) ? token[0] : (token ?? "")} />
  );
}

export default function Page({ searchParams }: PageProps<"/reset-password">) {
  return (
    <>
      <PageTitle title="Reset password - WCAG Auditor" />
      <Suspense fallback={null}>
        <ResetLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}
