/** Owns ordinary replacement retirement without enabling settings or releasing a possibly dispatched reservation. @module messaging-connection-replacement */
import {MILLISECONDS_PER_SECOND,SECONDS_PER_DAY} from "@/src/constants/time";
export const MESSAGING_CONNECTION_REPLACEMENT={reason:"connection_replaced",purgeLifetimeMs:SECONDS_PER_DAY*MILLISECONDS_PER_SECOND} as const;
