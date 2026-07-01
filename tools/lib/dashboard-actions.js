import fs from "node:fs";

const ACTIONS_FILE = "config/dashboard-actions.json";

export function loadDashboardActions(scriptEntries) {
  const config = fs.existsSync(ACTIONS_FILE)
    ? JSON.parse(fs.readFileSync(ACTIONS_FILE, "utf8"))
    : { sections: [] };

  const knownScripts = new Set();
  const sections = (config.sections ?? []).map((section) => {
    const actions = (section.actions ?? [])
      .map((action) => {
        const script = scriptEntries.find((item) => item.name === action.script);
        if (!script) return null;
        knownScripts.add(script.name);
        return {
          ...script,
          label: action.label ?? script.name,
          summary: action.summary ?? "",
          coverage: action.coverage ?? "",
          phase: action.phase ?? section.id,
        };
      })
      .filter(Boolean);

    return {
      id: section.id,
      title: section.title,
      description: section.description,
      actions,
    };
  });

  const uncategorized = scriptEntries
    .filter((script) => !knownScripts.has(script.name))
    .map((script) => ({
      ...script,
      label: script.name,
      summary: "Lenh chua duoc mo ta chi tiet trong dashboard-actions.json.",
      coverage: "Chua phan loai",
      phase: "uncategorized",
    }));

  if (uncategorized.length > 0) {
    sections.push({
      id: "uncategorized",
      title: "Lenh chua phan loai",
      description: "Cac npm script moi hoac chua duoc sap xep vao workflow.",
      actions: uncategorized,
    });
  }

  return sections;
}
