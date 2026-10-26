import { EndpointDirection, EndpointHttpMethod } from './endpoint.interface';

/** One AttendHub-side field a mapping on a global endpoint may use (same shape as a built-in purpose's field). */
export interface GlobalEndpointField {
  field: string;
  label: string;
}

/**
 * An endpoint the Super Admin defines once for every company. It carries no path: each Company Admin writes
 * their own path, tests it and maps its fields, exactly like a custom endpoint.
 */
export interface GlobalEndpoint {
  id: string;
  /** Becomes the endpoint name on the company side and the `/hr/custom/<name>` name in the app. */
  name: string;
  label: string;
  description: string | null;
  direction: EndpointDirection;
  defaultHttpMethod: EndpointHttpMethod;
  /** Optional AttendHub-side field list for the mapping dropdown. Empty = the Company Admin types field names freely. */
  fields: GlobalEndpointField[];
  callableBy: 'ADMIN' | 'ALL';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}
