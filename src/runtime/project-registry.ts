import type { CodexProjectClient } from './codex-project.ts';
import type { BridgeRouter } from '../core/router/router.ts';

export interface ProjectConfig {
  projectInstanceId: string;
  websocketUrl: string;
}

export interface ProjectRegistryOptions {
  getProjectConfig: (projectInstanceId: string) => ProjectConfig | null;
  createClient: (projectInstanceId: string, websocketUrl: string) => CodexProjectClient;
  router?: Pick<BridgeRouter, 'registerProjectHandler'>;
}

export interface ProjectRegistry {
  onBindingChanged(event: { type: string; projectId?: string; sessionId?: string }): Promise<void>;
  reconcileProjectConfigs(projectConfigs: ProjectConfig[]): Promise<void>;
  executeCommand(projectInstanceId: string, input: { method: string; params: Record<string, unknown> }): Promise<unknown>;
  getHandler(projectInstanceId: string): ((input: { projectInstanceId: string; message: { text: string } }) => Promise<{ text: string } | null>) | null;
  describeProject(projectInstanceId: string): Promise<ProjectState>;
  stop(): Promise<void>;
}

export interface ProjectState {
  projectInstanceId: string;
  configured: boolean;
  active: boolean;
  removed: boolean;
  sessionCount: number;
}

export function createProjectRegistry(options: ProjectRegistryOptions): ProjectRegistry {
  // projectId -> { client, bindingCount, sessions: Set<string> }
  const activeProjects = new Map<
    string,
    { client: CodexProjectClient; bindingCount: number; sessions: Set<string>; websocketUrl: string }
  >();
  const knownProjectIds = new Set<string>();
  let configuredProjectIds = new Set<string>();
  let hasReconciledConfigs = false;

  function markProjectKnown(projectId: string): void {
    knownProjectIds.add(projectId);
  }

  async function disconnectProject(projectId: string): Promise<void> {
    const entry = activeProjects.get(projectId);
    if (entry) {
      await entry.client.stop();
      activeProjects.delete(projectId);
    }
  }

  return {
    async reconcileProjectConfigs(projectConfigs: ProjectConfig[]): Promise<void> {
      hasReconciledConfigs = true;
      configuredProjectIds = new Set(projectConfigs.map((entry) => entry.projectInstanceId));
      for (const projectConfig of projectConfigs) {
        markProjectKnown(projectConfig.projectInstanceId);
      }
    },

    async onBindingChanged(event: { type: string; projectId?: string; sessionId?: string }) {
      if (event.type === 'bound' && event.projectId && event.sessionId) {
        const config = options.getProjectConfig(event.projectId);
        let entry = activeProjects.get(event.projectId);

        if (!entry) {
          if (!config) return;

          const client = options.createClient(event.projectId, config.websocketUrl);
          entry = {
            client,
            bindingCount: 0,
            sessions: new Set(),
            websocketUrl: config.websocketUrl,
          };
          activeProjects.set(event.projectId, entry);

          if (options.router) {
            options.router.registerProjectHandler(event.projectId, async ({ message }) => {
              try {
                const text = await client.generateReply({ text: message.text });
                return { text };
              } catch {
                return null;
              }
            });
          }
        } else if (config && entry.websocketUrl !== config.websocketUrl) {
          await disconnectProject(event.projectId);
          entry = undefined;
        } else if (!config && !entry.sessions.has(event.sessionId)) {
          return;
        }

        if (!entry) {
          const refreshedConfig = options.getProjectConfig(event.projectId);
          if (!refreshedConfig) return;

          const client = options.createClient(event.projectId, refreshedConfig.websocketUrl);
          entry = {
            client,
            bindingCount: 0,
            sessions: new Set(),
            websocketUrl: refreshedConfig.websocketUrl,
          };
          activeProjects.set(event.projectId, entry);

          if (options.router) {
            options.router.registerProjectHandler(event.projectId, async ({ message }) => {
              try {
                const text = await client.generateReply({ text: message.text });
                return { text };
              } catch {
                return null;
              }
            });
          }
        }

        markProjectKnown(event.projectId);
        entry.sessions.add(event.sessionId);
        entry.bindingCount = entry.sessions.size;
      }

      if ((event.type === 'session-unbound' || event.type === 'unbound') && (event.projectId || event.sessionId)) {
        let projectId = event.projectId ?? '';
        const sessionId = event.sessionId ?? '';

        // Find project by session if needed
        if (!projectId && sessionId) {
          for (const [pid, entry] of activeProjects) {
            if (entry.sessions.has(sessionId)) {
              projectId = pid;
              break;
            }
          }
        }

        if (!projectId) return;

        const entry = activeProjects.get(projectId);
        if (!entry) return;

        if (sessionId) {
          entry.sessions.delete(sessionId);
        }

        if (entry.sessions.size === 0) {
          await disconnectProject(projectId);
        } else {
          entry.bindingCount = entry.sessions.size;
        }
      }
    },

    getHandler(projectInstanceId) {
      const entry = activeProjects.get(projectInstanceId);
      if (!entry) return null;

      return async ({ message }) => {
        try {
          const text = await entry.client.generateReply({ text: message.text });
          return { text };
        } catch {
          return null;
        }
      };
    },

    async executeCommand(projectInstanceId: string, input: { method: string; params: Record<string, unknown> }): Promise<unknown> {
      const entry = activeProjects.get(projectInstanceId);
      if (!entry) {
        throw new Error(`Project ${projectInstanceId} is not active`);
      }

      if (entry.client.executeCommand === undefined) {
        throw new Error(`Project ${projectInstanceId} does not support structured Codex commands`);
      }

      return await entry.client.executeCommand(input);
    },

    async describeProject(projectInstanceId: string): Promise<ProjectState> {
      const active = activeProjects.get(projectInstanceId);
      const configured = hasReconciledConfigs
        ? configuredProjectIds.has(projectInstanceId)
        : options.getProjectConfig(projectInstanceId) !== null;
      if (configured || active !== undefined) {
        markProjectKnown(projectInstanceId);
      }
      return {
        projectInstanceId,
        configured,
        active: active !== undefined,
        removed: knownProjectIds.has(projectInstanceId) && !configured,
        sessionCount: active?.sessions.size ?? 0,
      };
    },

    async stop() {
      const projectIds = Array.from(activeProjects.keys());
      await Promise.all(projectIds.map((id) => disconnectProject(id)));
    },
  };
}
