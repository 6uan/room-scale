import { redirect } from "next/navigation";

/** The checklist became the overview: the same list, on the page it earned. */
export default function ChecklistPage() {
  redirect("/overview");
}
