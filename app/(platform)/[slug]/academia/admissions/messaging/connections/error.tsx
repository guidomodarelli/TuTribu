"use client";
/** Owns safe wizard render recovery without exposing runtime exceptions. @module messaging-connections-error */
import {AdmissionRouteError} from "@/components/academy-admissions/admission-route-error";
/** @param props - Native framework reset callback. @returns Safe Spanish feedback and explicit local retry. */
export default function MessagingConnectionsError({reset}:{reset:()=>void}){return<AdmissionRouteError reset={reset} />;}
