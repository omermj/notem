export interface Command {
  id: string;
  name: string;
  hotkey?: string;
  defaultHotkey?: string;
  hidden?: boolean;
  run(): void | Promise<void>;
}

export interface CommandActions {
  newNote(): void | Promise<void>;
  save(): void | Promise<void>;
  toggleReading(): void;
  splitRight(): void;
  splitDown(): void;
  openVault(): void | Promise<void>;
  rebuildIndex(): void | Promise<void>;
  toggleTheme(): void | Promise<void>;
  dailyNote(): void | Promise<void>;
  newTab(): void;
  closeTab(): void;
  historyBack(): void | Promise<void>;
  historyForward(): void | Promise<void>;
  showPalette(): void;
  showQuickSwitcher(): void;
  showGlobalSearch(): void;
  showGraph(): void;
  showSettings(): void;
  toggleLeftSidebar(): void;
  toggleRightSidebar(): void;
  insertTemplate(): void;
  insertImage(): void | Promise<void>;
  newFromTemplate(): void;
  showDebugTimings(): void | Promise<void>;
}

let actions: CommandActions | null = null;

export function configureCommands(next: CommandActions): void {
  actions = next;
}

const invoke = (action: keyof CommandActions) => (): void | Promise<void> => {
  if (!actions) return;
  return actions[action]();
};

export const commands: Command[] = [
  {
    id: "debug.timings",
    name: "Debug: Show performance timings",
    hidden: true,
    run: invoke("showDebugTimings"),
  },
  {
    id: "template.insert",
    name: "Insert template",
    hotkey: "Mod+Shift+I",
    run: invoke("insertTemplate"),
  },
  {
    id: "image.insert",
    name: "Insert image",
    run: invoke("insertImage"),
  },
  {
    id: "template.new",
    name: "New note from template",
    run: invoke("newFromTemplate"),
  },
  {
    id: "settings.open",
    name: "Open settings",
    hotkey: "Mod+,",
    run: invoke("showSettings"),
  },
  {
    id: "sidebar.left.toggle",
    name: "Toggle left sidebar",
    run: invoke("toggleLeftSidebar"),
  },
  {
    id: "sidebar.right.toggle",
    name: "Toggle right sidebar",
    run: invoke("toggleRightSidebar"),
  },
  {
    id: "palette.open",
    name: "Open command palette",
    hotkey: "Mod+P",
    run: invoke("showPalette"),
  },
  {
    id: "switcher.open",
    name: "Open quick switcher",
    hotkey: "Mod+O",
    run: invoke("showQuickSwitcher"),
  },
  {
    id: "search.global",
    name: "Search all notes",
    hotkey: "Mod+Shift+F",
    run: invoke("showGlobalSearch"),
  },
  {
    id: "graph.open",
    name: "Open graph view",
    run: invoke("showGraph"),
  },
  { id: "note.new", name: "New note", hotkey: "Mod+N", run: invoke("newNote") },
  {
    id: "file.save",
    name: "Save current note",
    hotkey: "Mod+S",
    run: invoke("save"),
  },
  {
    id: "view.toggle",
    name: "Toggle reading view",
    hotkey: "Mod+E",
    run: invoke("toggleReading"),
  },
  {
    id: "pane.split-right",
    name: "Split right",
    hotkey: "Mod+\\",
    run: invoke("splitRight"),
  },
  {
    id: "pane.split-down",
    name: "Split down",
    hotkey: "Mod+Shift+\\",
    run: invoke("splitDown"),
  },
  {
    id: "vault.open",
    name: "Open vault",
    hotkey: "Mod+Shift+O",
    run: invoke("openVault"),
  },
  {
    id: "index.rebuild",
    name: "Rebuild index",
    hotkey: "Mod+Shift+R",
    run: invoke("rebuildIndex"),
  },
  {
    id: "theme.toggle",
    name: "Toggle light/dark theme",
    hotkey: "Mod+Shift+L",
    run: invoke("toggleTheme"),
  },
  {
    id: "daily.open",
    name: "Open today's daily note",
    hotkey: "Mod+D",
    run: invoke("dailyNote"),
  },
  { id: "tab.new", name: "New tab", hotkey: "Mod+T", run: invoke("newTab") },
  {
    id: "tab.close",
    name: "Close tab",
    hotkey: "Mod+W",
    run: invoke("closeTab"),
  },
  {
    id: "history.back",
    name: "Navigate back",
    hotkey: "Mod+Alt+ArrowLeft",
    run: invoke("historyBack"),
  },
  {
    id: "history.forward",
    name: "Navigate forward",
    hotkey: "Mod+Alt+ArrowRight",
    run: invoke("historyForward"),
  },
];

for (const command of commands) command.defaultHotkey = command.hotkey;

let hotkeys = new Map<string, Command>();

export function configureHotkeys(overrides: Record<string, string>): void {
  for (const command of commands) {
    command.hotkey = overrides[command.id] ?? command.defaultHotkey;
  }
  hotkeys = new Map(
    commands
      .filter((command): command is Command & { hotkey: string } =>
        Boolean(command.hotkey),
      )
      .map((command) => [command.hotkey, command]),
  );
}

configureHotkeys({});

function eventHotkey(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key =
    event.code === "Backslash"
      ? "\\"
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key;
  parts.push(key);
  return parts.join("+");
}

export function handleShortcut(event: KeyboardEvent): boolean {
  const command = hotkeys.get(eventHotkey(event));
  if (!command) return false;
  event.preventDefault();
  event.stopPropagation();
  void Promise.resolve(command.run());
  return true;
}

export function runCommand(id: string): void {
  const command = commands.find((candidate) => candidate.id === id);
  if (command) void Promise.resolve(command.run());
}
