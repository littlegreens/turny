import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ orgSlug: string; calId: string }>;
};

export default async function CalendarSchedulesPage({ params }: Props) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/turni`);
}
