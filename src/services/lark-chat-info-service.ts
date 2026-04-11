import type { Client } from '@larksuiteoapi/node-sdk';

export class LarkChatInfoService {
  private readonly client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async getChatName(chatId: string): Promise<string | null> {
    try {
      const response = await this.client.im.v1.chat.get({
        path: {
          chat_id: chatId,
        },
      });

      const data = response.data;
      if (data === undefined || data === null) {
        return null;
      }

      if (data.chat_type === 'p2p') {
        return '[P2P]';
      }

      if (typeof data.name === 'string' && data.name.trim() !== '') {
        return data.name;
      }

      return null;
    } catch {
      return null;
    }
  }
}
