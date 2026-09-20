import { create } from "zustand";
export interface LayoutPreferences {
  rulers: boolean;
  guides: boolean;
  grid: boolean;
  snap: boolean;
  gridStep: number;
}
const defaults: LayoutPreferences = {
  rulers: false,
  guides: true,
  grid: false,
  snap: true,
  gridStep: 20,
};
function read(): LayoutPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem("slidex-layout") || "{}");
    return {
      ...defaults,
      ...Object.fromEntries(
        ["rulers", "guides", "grid", "snap"]
          .filter((key) => typeof saved[key] === "boolean")
          .map((key) => [key, saved[key]]),
      ),
      gridStep:
        Number.isFinite(saved.gridStep) &&
        saved.gridStep >= 2 &&
        saved.gridStep <= 200
          ? saved.gridStep
          : 20,
    };
  } catch {
    return defaults;
  }
}
export const useLayoutPreferences = create<{
  settings: LayoutPreferences;
  patch: (patch: Partial<LayoutPreferences>) => void;
}>((set, get) => ({
  settings: read(),
  patch: (patch) => {
    const settings = { ...get().settings, ...patch };
    if (
      !Number.isFinite(settings.gridStep) ||
      settings.gridStep < 2 ||
      settings.gridStep > 200
    )
      return;
    localStorage.setItem("slidex-layout", JSON.stringify(settings));
    set({ settings });
  },
}));
