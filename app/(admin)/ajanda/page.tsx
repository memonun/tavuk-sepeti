import { redirect } from "next/navigation";

/** Ajanda was replaced by Anımsatıcılar; old bookmarks land on the new page. */
export default function AjandaRedirectPage(): never {
  redirect("/animsaticilar");
}
