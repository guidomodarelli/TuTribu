export type SitepingConsoleDiagnosticLevel = "error" | "info" | "log" | "warn";

export type SitepingConsoleDiagnosticEntry = {
  level: SitepingConsoleDiagnosticLevel;
  message: string;
  timestamp: string;
};

export type SitepingNetworkDiagnosticEntry = {
  durationMs: number;
  method: string;
  status: number;
  timestamp: string;
  url: string;
};

export type SitepingDiagnosticsSnapshot = {
  console: SitepingConsoleDiagnosticEntry[];
  network: SitepingNetworkDiagnosticEntry[];
};

