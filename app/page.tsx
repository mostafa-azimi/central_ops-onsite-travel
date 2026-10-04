import { getTravelFeed } from "@/lib/calendar";
import { TravelDashboard } from "@/components/travel-dashboard";

export const revalidate = 900;

export default async function Home() {
  const feed = await getTravelFeed();
  return <TravelDashboard feed={feed} />;
}
