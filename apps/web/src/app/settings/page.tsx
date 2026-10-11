import { PageTitle } from "@/components/page-title";
import { SettingsScreen } from "@/components/settings/settings-screen";

export default function Page() {
  return (
    <>
      <PageTitle title="Settings - WCAG Auditor" />
      <SettingsScreen />
    </>
  );
}
