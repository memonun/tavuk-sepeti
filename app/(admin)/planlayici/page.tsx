import { redirect } from "next/navigation";

/** Planlayıcı was replaced by Takvim; old bookmarks land on the new page. */
export default function PlanlayiciRedirectPage(): never {
  redirect("/takvim");
}
