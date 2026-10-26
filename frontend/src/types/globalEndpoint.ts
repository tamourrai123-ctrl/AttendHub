import type { EndpointDirection, EndpointPurposeField } from "./endpoint";

/** A Super Admin defined endpoint every Company Admin can pick. It has no path: each company writes its own. */
export interface GlobalEndpoint {
  id: string;
  name: string;
  label: string;
  description: string | null;
  direction: EndpointDirection;
  defaultHttpMethod: "GET" | "POST";
  /** Optional AttendHub-side fields for the mapping dropdown. Empty means the Company Admin types field names. */
  fields: EndpointPurposeField[];
  callableBy: "ADMIN" | "ALL";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface GlobalEndpointInput {
  name?: string;
  label: string;
  description?: string;
  direction: EndpointDirection;
  defaultHttpMethod: "GET" | "POST";
  fields: EndpointPurposeField[];
  callableBy: "ADMIN" | "ALL";
}

export interface GlobalEndpointListResult {
  items: GlobalEndpoint[];
  page: number;
  limit: number;
  total: number;
}
