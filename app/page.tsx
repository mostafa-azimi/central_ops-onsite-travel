import { getTravelFeed } from "@/lib/calendar";
import { TravelDashboard } from "@/components/travel-dashboard";
import { databaseConfigured } from "@/lib/db";

export const revalidate = 900;

export default async function Home() {
  const feed = await getTravelFeed();
  return <TravelDashboard
    feed={feed}
    requestStorageConfigured={databaseConfigured()}
    mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
  />;
}
