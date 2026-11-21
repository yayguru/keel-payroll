import { Desk } from "@/components/desk";
import { seedState } from "@/lib/demo-state";

export default function Home() {
  return <Desk initial={seedState()} />;
}
