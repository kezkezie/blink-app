import { redirect } from "next/navigation";

// Analytics only counted BlinkSpot's own posts (the Plan page shows those counts). Real social
// analytics needs the platform APIs; until then this goes to the calendar instead of a classic screen.
export default function AnalyticsPage() {
  redirect("/studio/plan");
}
