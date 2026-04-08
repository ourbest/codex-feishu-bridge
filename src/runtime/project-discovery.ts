import { readdirSync } from 'node:fs';
import path from 'node:path';

import {
  cloneProjectConfigEntry,
  createProjectConfigEntry,
  loadProjectsFromFile,
  normalizeProjectConfig,
  resolvePathLikeInput,
  type ProjectConfigEntry,
} from './project-config.ts';

export interface ProjectDiscoveryOptions {
  projectsFilePath: string;
  projectsRoot?: string;
  homeDir?: string;
}

function isDirectoryNameVisible(name: string): boolean {
  return name !== '' && !name.startsWith('.');
}

export function discoverProjectsFromRoot(rootPath: string, options?: { homeDir?: string }): ProjectConfigEntry[] {
  const resolvedRoot = resolvePathLikeInput(rootPath, options?.homeDir);
  if (resolvedRoot === undefined || resolvedRoot.trim() === '') {
    return [];
  }

  try {
    return readdirSync(resolvedRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isDirectoryNameVisible(entry.name))
      .map((entry) => {
        const cwd = path.resolve(resolvedRoot, entry.name);
        const normalized = normalizeProjectConfig({
          projectInstanceId: entry.name,
          cwd,
        }, { homeDir: options?.homeDir });

        return createProjectConfigEntry({
          projectInstanceId: normalized.projectInstanceId,
          cwd: normalized.cwd,
          providers: normalized.providers,
        });
      })
      .sort((left, right) => left.projectInstanceId.localeCompare(right.projectInstanceId));
  } catch {
    return [];
  }
}

export function mergeProjectConfigs(
  explicitProjects: ProjectConfigEntry[],
  discoveredProjects: ProjectConfigEntry[],
): ProjectConfigEntry[] {
  const merged = new Map<string, ProjectConfigEntry>();

  for (const entry of explicitProjects) {
    merged.set(entry.projectInstanceId, cloneProjectConfigEntry(entry));
  }

  for (const entry of discoveredProjects) {
    if (!merged.has(entry.projectInstanceId)) {
      merged.set(entry.projectInstanceId, cloneProjectConfigEntry(entry));
    }
  }

  return [...merged.values()];
}

export function loadProjectConfigs(options: ProjectDiscoveryOptions): ProjectConfigEntry[] {
  const explicitProjects = loadProjectsFromFile(options.projectsFilePath, { homeDir: options.homeDir }) ?? [];
  const discoveredProjects = options.projectsRoot !== undefined && options.projectsRoot.trim() !== ''
    ? discoverProjectsFromRoot(options.projectsRoot, { homeDir: options.homeDir })
    : [];

  return mergeProjectConfigs(explicitProjects, discoveredProjects);
}
