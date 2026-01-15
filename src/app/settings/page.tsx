import UserSettings from "@/components/UserSettings";

export const metadata = {
  title: "Settings | Mise AI",
  description: "Manage your Mise AI account settings",
};

export default function SettingsPage() {
  return (
    <div className="py-8">
      <UserSettings />
    </div>
  );
}
