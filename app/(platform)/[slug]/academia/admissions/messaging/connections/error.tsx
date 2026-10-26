"use client";
/** Owns safe wizard render recovery without exposing runtime exceptions. @module messaging-connections-error */
import {AdmissionRouteError} from "@/components/academy-admissions/admission-route-error";
import { AdmissionSettingsPage } from "@/components/academy-admissions/admission-settings-page";
/** @param props - Native framework retry callback. @returns Safe Spanish feedback and explicit local retry. */
export default function MessagingConnectionsError({retry}:{retry:()=>void}){return<AdmissionSettingsPage page="connections"><AdmissionRouteError embedded retry={retry} /></AdmissionSettingsPage>;}
