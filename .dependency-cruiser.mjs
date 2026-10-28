import { createDependencyCruiserConfig } from "@golfo/lint/dependency-cruiser";

// Hexagonal modules: domain depends on nothing, application not on infrastructure, and no layer imports a setup.ts,
// the composition root that wires them.
export default createDependencyCruiserConfig({ hexagonalModulesPath: "src/modules" });
