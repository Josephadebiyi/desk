/**
 * Feature switches decided at build time.
 * Online giving through ZionDesk Payments (Flutterwave) is off for now: churches collect offerings with
 * their own details (bank transfer, IBAN, Bizum, M-Pesa…). Build with VITE_ONLINE_GIVING=1 to turn it on
 * (and set ONLINE_GIVING=1 on the server).
 */
export const ONLINE_GIVING = import.meta.env.VITE_ONLINE_GIVING === '1'
