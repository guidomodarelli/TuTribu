/** Publishes privacy information independently of account, tribe and admission access. */
import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/legal/privacy-policy";

export const metadata: Metadata = {
  title: "Política de privacidad | TuTribu",
  description: "Cómo TuTribu utiliza los datos de cuenta y del servicio, y cómo contactar a su responsable.",
};

/** Renders the public policy without looking up a session or calling a provider. */
export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
