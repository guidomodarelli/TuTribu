/** Owns the precision comparison used after ISO input validation, independently of storage timestamp rounding. @module admission-review-dates */
export const ADMISSION_REVIEW_DATE_COMPARISON = { fractionPattern: /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/u, millisecondFractionDigits: 3 } as const;
