import type { PricingPlan } from "../types/pricing";

/** MOCK DATA — development only. Seed data for `mockPricingService`. */
export const MOCK_PRICING_PLANS: PricingPlan[] = [
  {
    id: "plan_starter",
    name: "Starter",
    description: "For small teams just getting started with attendance tracking.",
    monthlyPrice: 9,
    yearlyPrice: 90,
    currency: "USD",
    features: ["Up to 25 employees", "1 HR integration", "Attendance history", "Email support"],
    recommended: false,
    displayOrder: 1,
    active: true,
  },
  {
    id: "plan_professional",
    name: "Professional",
    description: "For growing companies that need deeper visibility and monitoring.",
    monthlyPrice: 29,
    yearlyPrice: 290,
    currency: "USD",
    features: [
      "Up to 250 employees",
      "Unlimited HR integrations",
      "API monitoring & system logs",
      "Attendance history & reports",
      "Priority support",
    ],
    recommended: true,
    displayOrder: 2,
    active: true,
  },
  {
    id: "plan_enterprise",
    name: "Enterprise",
    description: "For large organizations with advanced compliance and support needs.",
    monthlyPrice: 79,
    yearlyPrice: 790,
    currency: "USD",
    features: [
      "Unlimited employees",
      "Unlimited HR integrations",
      "Dedicated account manager",
      "Custom reporting",
      "24/7 priority support",
    ],
    recommended: false,
    displayOrder: 3,
    active: true,
  },
];
