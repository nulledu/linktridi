import { notFound } from "next/navigation";
import { ProvaTutoriais } from "./ProvaTutoriais";

export default function DevTutoriaisPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProvaTutoriais />;
}
