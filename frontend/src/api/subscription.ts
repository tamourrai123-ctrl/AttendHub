import { apiClient, type ApiMessageResponse, type ApiSuccessResponse } from "./client";
import type { AppUser, CompanySubscription } from "../types/subscription";

/**
 * Company Admin's plan & usage — backend/src/subscriptions/subscriptions.controller.ts:
 *   GET    /subscription/mine
 *   POST   /subscription/mine/plan
 *   GET    /subscription/mine/app-users
 *   DELETE /subscription/mine/app-users/:externalEmployeeId
 */

/** Fired after the plan or the seat list changes, so the layout's plan banner refreshes. */
export const SUBSCRIPTION_CHANGED_EVENT = "attendhub:subscription-changed";

export function notifySubscriptionChanged(): void {
  window.dispatchEvent(new Event(SUBSCRIPTION_CHANGED_EVENT));
}

export async function getMySubscription(): Promise<CompanySubscription> {
  const response = await apiClient.get<ApiSuccessResponse<CompanySubscription>>("/subscription/mine");
  return response.data;
}

export async function changeMyPlan(planId: string): Promise<CompanySubscription> {
  const response = await apiClient.post<ApiSuccessResponse<CompanySubscription>>("/subscription/mine/plan", { planId });
  return response.data;
}

export async function getMyAppUsers(): Promise<AppUser[]> {
  const response = await apiClient.get<ApiSuccessResponse<AppUser[]>>("/subscription/mine/app-users");
  return response.data;
}

export async function removeMyAppUser(externalEmployeeId: string): Promise<string> {
  const response = await apiClient.delete<ApiMessageResponse>(
    `/subscription/mine/app-users/${encodeURIComponent(externalEmployeeId)}`
  );
  return response.message;
}
