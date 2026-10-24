/** Loads early usage through one native server entrypoint inside this leaf's runtime boundary. @module admission-messaging-settings-page */
import { Suspense } from "react";
import { createMessagingUsageRequestModule } from "@/src/modules/setup";
import { loadMessagingUsagePageState } from "@/src/modules/messaging/infrastructure/composition/messaging-usage-page";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
import { MessagingUsageContainer } from "./messaging-usage-container";
import Loading from "./loading";
import { admissionPolicyStepHref, readAdmissionSettingsNavigation } from "@/src/modules/academy-admissions/constants/admission-settings-navigation";
import { ADMISSION_POLICY_ENTRY_STEP } from "@/src/modules/academy-admissions/constants/admission-policy-flow";
import { ADMISSION_POLICY_DRAFT_COPY } from "@/src/modules/academy-admissions/constants/admission-policy-browser";

/** @param props - Runtime params/query resolved only below the leaf Suspense. @returns Current own usage and deterministic localized choices, without a loopback read or initialization. */
async function MessagingContent({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [route, rawQuery] = await Promise.all([params, searchParams]);
  const { navigation, query } = readAdmissionSettingsNavigation(rawQuery);
  const state = await loadMessagingUsagePageState({ params: route, query }, async () => (await createMessagingUsageRequestModule()).createPage());
  const key = state.kind === "ready" ? `${state.slug}:${state.viewerId}` : state.code;
  /** Only the allowlisted return from the rules review adds the way back; it never carries a free URL. */
  const links = navigation.returnTo && state.kind === "ready" ? [{ href: admissionPolicyStepHref(state.slug, ADMISSION_POLICY_ENTRY_STEP.review), label: ADMISSION_POLICY_DRAFT_COPY.returnToRules }] : [];
  return <AdmissionSettingsPage page="usage" links={links}><MessagingUsageContainer key={key} initialState={state} /></AdmissionSettingsPage>;
}
/** @param props - Unresolved framework runtime inputs. @returns An own leaf skeleton and the single current server loader. */
export default function AdmissionMessagingSettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <Suspense fallback={<Loading />}><MessagingContent {...props} /></Suspense>; }
