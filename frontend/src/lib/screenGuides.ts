/** Help text for each screen. English only for now; edit here and every guide card updates. */
export interface ScreenGuide {
  title: string;
  intro: string;
  steps: string[];
  tip?: string;
}

export const SCREEN_GUIDES: Record<string, ScreenGuide> = {
  "/control/dashboard": {
    title: "Platform dashboard",
    intro: "A quick picture of every company on the platform.",
    steps: [
      "Check the cards at the top for companies, integrations and API traffic.",
      "Use the charts to spot busy days or a sudden drop.",
      "Open Companies or API Monitoring from the sidebar when something looks off.",
    ],
  },
  "/control/companies": {
    title: "Companies",
    intro: "Create and manage the companies that use AttendHub.",
    steps: [
      "Press Add company to create one. Its short name is what your HR system knows it by.",
      "Search or filter the list, then open a row to see its details.",
      "Use the row actions to edit a company or switch it on or off.",
    ],
    tip: "Switching a company off stops its mobile app from signing in.",
  },
  "/control/integrations": {
    title: "Integrations",
    intro: "Each company connects to its own HR system here.",
    steps: [
      "Press the eye icon on a row to open its details.",
      "On the Field Mapping tab, switch Custom mapping on for the endpoints a Company Admin may map themselves.",
      "Use Test to check that the HR system answers.",
    ],
    tip: "Custom mapping is off by default. The Company Admin only sees the mapping section after you switch it on for that endpoint.",
  },
  "/control/api-monitoring": {
    title: "API monitoring",
    intro: "Every call the platform makes to HR systems, with its result.",
    steps: [
      "Filter by status or search to narrow the list.",
      "Open a call to see its status code and how long it took.",
      "Repeated failures for one company usually mean its HR system or credentials need attention.",
    ],
  },
  "/control/system-logs": {
    title: "System logs",
    intro: "A record of who changed what on the platform.",
    steps: [
      "Search by user or action to find a change.",
      "Open a row to see the full description.",
      "Warnings and errors are worth a look first.",
    ],
  },
  "/control/pricing": {
    title: "Pricing",
    intro: "The plans companies can choose from.",
    steps: [
      "Press Add plan to create one, with its price and limits.",
      "Edit a plan to change what it includes.",
      "Switch a plan off to hide it from new sign-ups without deleting it.",
    ],
  },
  "/control/settings": {
    title: "Settings",
    intro: "Platform-wide options for the Super Admin.",
    steps: ["Change an option.", "Press Save changes to apply it."],
  },

  "/company/dashboard": {
    title: "Your dashboard",
    intro: "Today's attendance for your company at a glance.",
    steps: [
      "Check the cards for present, late and absent employees.",
      "Use the chart to compare days.",
      "Open Employees to look at one person.",
    ],
  },
  "/company/employees": {
    title: "Employees",
    intro: "The people from your HR system who can use the mobile app.",
    steps: [
      "Search or filter to find someone.",
      "Open a row to see their details.",
      "Use the sync action to pull the latest employee list from your HR system.",
    ],
    tip: "The number of app users you can have depends on your plan. See Plan & usage.",
  },
  "/company/integrations": {
    title: "Integrations",
    intro: "Connect AttendHub to your HR system and choose what the app can read and send.",
    steps: [
      "Enter your HR base URL and choose how to sign in (auth type), then press Save changes.",
      "Under Endpoints, add one for each thing the app needs. Pick a built-in purpose, or choose Custom for your own.",
      "Write the path starting with /. Use :p_shortname or {{shortname}} for values we fill in, and :p_date for a date (today by default).",
      "Press Test on an endpoint. Fill the boxes for any value it asks for, then check the answer.",
      "If custom mapping is switched on for an endpoint, add field mappings to choose which fields the app gets, and check the preview.",
      "For a custom endpoint, choose who can call it from the app: Company Admin only, or Admin and Employees.",
    ],
    tip: "The app calls a custom endpoint at /hr/custom/<endpoint name>. The name must match exactly.",
  },
  "/company/plan": {
    title: "Plan & usage",
    intro: "Your plan, trial and how many app users you are using.",
    steps: [
      "Check how many seats are in use.",
      "Press Choose a plan or Upgrade to change plan.",
      "When a trial ends, the mobile app pauses until you pick a plan.",
    ],
  },
  "/company/settings": {
    title: "Settings",
    intro: "Options for your company.",
    steps: ["Change an option.", "Press Save changes to apply it."],
  },
};

export function guideForPath(pathname: string): ScreenGuide | undefined {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SCREEN_GUIDES[clean];
}
