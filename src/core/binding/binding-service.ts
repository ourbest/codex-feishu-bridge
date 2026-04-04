import type { BindingStore } from '../../storage/binding-store.ts';

export type BindingChangeEvent =
  | { type: 'bound'; projectId: string; sessionId: string }
  | { type: 'unbound'; projectId: string }
  | { type: 'session-unbound'; sessionId: string };

export class BindingService {
  private readonly store: BindingStore;
  private readonly observers: Array<(event: BindingChangeEvent) => void | Promise<void>> = [];

  constructor(store: BindingStore) {
    this.store = store;
  }

  onBindingChange(observer: (event: BindingChangeEvent) => void | Promise<void>): void {
    this.observers.push(observer);
  }

  private async notify(event: BindingChangeEvent): Promise<void> {
    for (const observer of this.observers) {
      await observer(event);
    }
  }

  async bindProjectToSession(projectInstanceId: string, sessionId: string): Promise<void> {
    this.store.setBinding(projectInstanceId, sessionId);
    await this.notify({ type: 'bound', projectId: projectInstanceId, sessionId });
  }

  async unbindProject(projectInstanceId: string): Promise<void> {
    this.store.deleteByProject(projectInstanceId);
    await this.notify({ type: 'unbound', projectId: projectInstanceId });
  }

  async unbindSession(sessionId: string): Promise<void> {
    this.store.deleteBySession(sessionId);
    await this.notify({ type: 'session-unbound', sessionId });
  }

  async getSessionByProject(projectInstanceId: string): Promise<string | null> {
    return this.store.getSessionByProject(projectInstanceId);
  }

  async getProjectBySession(sessionId: string): Promise<string | null> {
    return this.store.getProjectBySession(sessionId);
  }

  async getAllBindings(): Promise<Array<{ projectInstanceId: string; sessionId: string }>> {
    return this.store.getAllBindings();
  }
}
