import type { Metadata } from "next"

import PricingPage from "@/app/pricing/page"

export const metadata: Metadata = {
  title: "Billing | Trifecta",
  description: "Trifecta billing plans, launch-hour usage, sandbox sizes, and GPU add-on pricing.",
}

export default function BillingPage() {
  return <PricingPage />
}
