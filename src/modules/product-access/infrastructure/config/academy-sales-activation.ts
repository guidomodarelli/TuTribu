/**
 * Deployment switch for academy sales.
 *
 * Opening sales requires external evidence that the provider invoice/period
 * contract behaves as the adapter expects (see
 * docs/architecture/academy-access.htm). Until an operator sets
 * `ACADEMY_SALES_ACTIVATION_ENABLED=true` in a supervised activation, no tribe
 * can turn `sales_enabled` on, whatever its leader requests.
 *
 * @module academy-sales-activation
 */

const ACADEMY_SALES_ACTIVATION_ENV = "ACADEMY_SALES_ACTIVATION_ENABLED";
const ENABLED_VALUE = "true";

/**
 * @returns Whether this deployment allows enabling academy sales.
 */
export function isAcademySalesActivationAllowed(): boolean {
  return process.env[ACADEMY_SALES_ACTIVATION_ENV] === ENABLED_VALUE;
}
