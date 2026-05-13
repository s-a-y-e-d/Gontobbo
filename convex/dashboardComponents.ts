export const DASHBOARD_COMPONENT_KEYS = [
  "todayTodo",
  "todoCompletion",
  "syllabusCompletion",
  "nextTermTime",
  "progressionRate",
  "studyVolume",
  "subjectProgress",
  "effortWeightage",
] as const;

export type DashboardComponentKey = (typeof DASHBOARD_COMPONENT_KEYS)[number];

export type DashboardComponentVisibility = Record<DashboardComponentKey, boolean>;

export const DASHBOARD_COMPONENT_SETTING_PREFIX = "dashboardComponent.";

export const DEFAULT_DASHBOARD_COMPONENT_VISIBILITY: DashboardComponentVisibility = {
  todayTodo: true,
  todoCompletion: false,
  syllabusCompletion: true,
  nextTermTime: true,
  progressionRate: false,
  studyVolume: false,
  subjectProgress: false,
  effortWeightage: false,
};

export function isDashboardComponentKey(
  key: string,
): key is DashboardComponentKey {
  return DASHBOARD_COMPONENT_KEYS.includes(key as DashboardComponentKey);
}

export function getDashboardComponentSettingKey(key: DashboardComponentKey) {
  return `${DASHBOARD_COMPONENT_SETTING_PREFIX}${key}`;
}

export function resolveDashboardComponentVisibility(
  settings: Array<{ key: string; value: string | number | boolean }>,
): DashboardComponentVisibility {
  const visibility = { ...DEFAULT_DASHBOARD_COMPONENT_VISIBILITY };
  const settingByKey = new Map(settings.map((setting) => [setting.key, setting]));

  for (const componentKey of DASHBOARD_COMPONENT_KEYS) {
    const setting = settingByKey.get(
      getDashboardComponentSettingKey(componentKey),
    );
    if (typeof setting?.value === "boolean") {
      visibility[componentKey] = setting.value;
    }
  }

  return visibility;
}
