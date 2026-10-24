/** Names the pinned provider contract and safe own verification copy. @module zavu-delivery-constants */
/** Fixes the endpoint rather than accepting a browser or environment-selected destination. */
export const ZAVU_DELIVERY_ENDPOINT = { origin: "https://api.zavu.dev", path: "/v1/messages" } as const;
/** Selects only explicit product channels and body types. */
export const ZAVU_DELIVERY_CHANNEL = { email: "email", sms: "sms", whatsapp: "whatsapp" } as const;
/** Avoids an implicit provider format or fallback. */
export const ZAVU_MESSAGE_TYPE = { text: "text", template: "template" } as const;
/** Uses only the consumed upstream discriminators; no schema is imposed on the provider payload. */
export const ZAVU_DELIVERY_STATUS = { queued: "queued", sending: "sending", sent: "sent", delivered: "delivered", read: "read", failed: "failed" } as const;
/** Excludes inbound messages from the original outbound attempt's receipt. */
export const ZAVU_MESSAGE_DIRECTION = { outbound: "outbound" } as const;
/** Keeps request scope independent of SDK default/custom global headers. */
export const ZAVU_DELIVERY_HEADER = { authorization: "Authorization", sender: "Zavu-Sender", contentType: "Content-Type", accept: "Accept", requestId: "X-Request-Id" } as const;
/** Keeps low-level transport values named at their owner. */
export const ZAVU_DELIVERY_TRANSPORT = { method: "POST", json: "application/json", authorizationPrefix: "Bearer ", redirect: "error", logLevel: "off", maximumRetries: 0 } as const;
/** Displays the same safe product copy across mail and SMS while OTP remains transient. */
export const VERIFICATION_MESSAGE_COPY = { subject: "Tu código de TuTribu", prefix: "Tu código de TuTribu es ", suffix: ". Vence en 10 minutos. No lo compartas." } as const;
/** Names the configured authentication-template parameter, without inventing a language request field. */
export const ZAVU_OTP_TEMPLATE_PARAMETER = "1";
