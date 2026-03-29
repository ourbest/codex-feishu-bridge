import type { BindingStore } from '../../storage/binding-store.ts';

export class BindingService {
  private readonly store: BindingStore;

  constructor(store: BindingStore) {
    this.store = store;
  }

  async bindProjectToSession(projectInstanceId: string, sessionId: string): Promise<void> {
    this.store.setBinding(projectInstanceId, sessionId);
  }

  async unbindProject(projectInstanceId: string): Promise<void> {
    this.store.deleteByProject(projectInstanceId);
  }

  async getSessionByProject(projectInstanceId: string): Promise<string | null> {
    return this.store.getSessionByProject(projectInstanceId);
  }

  async getProjectBySession(sessionId: string): Promise<string | null> {
    return this.store.getProjectBySession(sessionId);
  }
}
