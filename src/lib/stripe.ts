import Stripe from "stripe";

// docs/REQUIREMENTS.md §4.8: カード情報は自社で保持せずStripeに委譲する。
// STRIPE_SECRET_KEY はGitHub Secrets / .env.local で管理し、コミットしない（docs/CICD.md §8）。
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = secretKey
  ? new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" })
  : null;

export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error(
      "STRIPE_SECRET_KEY が未設定です。.env.local または本番Secretsに設定してください。",
    );
  }
  return stripe;
}
