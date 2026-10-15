/** Supplies synthetic auth-only runtime settings without reusing messaging key rules. @module better-auth-privacy-test-constants */
export const BETTER_AUTH_PRIVACY_TEST = { baseUrl: "https://auth.example.test", localBaseUrl: "http://127.0.0.1:3000", secretBytes: 32, cookieMaxAgeToleranceSeconds: 60 } as const;
