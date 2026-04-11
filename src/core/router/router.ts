import type { InboundMessage, OutboundMessage, ProjectReply } from '../events/message.ts';
import type { BindingService } from '../binding/binding-service.ts';

type ProjectMessageHandler = (input: {
  projectInstanceId: string;
  message: InboundMessage;
}) => Promise<ProjectReply | null>;

export class BridgeRouter {
  private readonly bindingService: BindingService;
  private readonly handlers = new Map<string, ProjectMessageHandler>();

  constructor(bindingService: BindingService) {
    this.bindingService = bindingService;
  }

  registerProjectHandler(projectInstanceId: string, handler: ProjectMessageHandler): void {
    this.handlers.set(projectInstanceId, handler);
  }

  hasProjectHandler(projectInstanceId: string): boolean {
    return this.handlers.has(projectInstanceId);
  }

  async routeInboundMessage(message: InboundMessage): Promise<OutboundMessage | null> {
    const projectInstanceId = await this.bindingService.getProjectBySession(message.sessionId);
    if (projectInstanceId === null) {
      return null;
    }

    void this.bindingService.enrichSessionName(message.sessionId);

    const handler = this.handlers.get(projectInstanceId);
    if (handler === undefined) {
      return null;
    }

    const reply = await handler({
      projectInstanceId,
      message,
    });

    if (reply === null) {
      return null;
    }

    return {
      targetSessionId: message.sessionId,
      text: reply.text,
    };
  }
}
