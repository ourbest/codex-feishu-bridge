import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import type { Client } from '@larksuiteoapi/node-sdk';

/** 允许下载的最大文件大小（50MB） */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** 下载超时时间（60秒） */
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface DownloadedFile {
  /** 文件二进制数据 */
  buffer: Buffer;
  /** 原始文件名 */
  fileName: string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节） */
  fileSize: number;
}

/**
 * 从飞书下载消息中的文件资源
 *
 * 使用 `im.v1.messageResource.get` API，支持获取消息中的图片、文件、音频等资源。
 * SDK 返回的是可读流（ReadableStream），需要消费流获取二进制内容。
 */
export async function downloadFeishuFile(
  client: Client,
  messageId: string,
  fileKey: string,
): Promise<DownloadedFile> {
  try {
    // 使用 SDK 的 im.v1.messageResource.get 方法
    // 文档: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message-resource/get
    const result = await client.im.v1.messageResource.get({
      path: {
        message_id: messageId,
        file_key: fileKey,
      },
    });

    const stream = result.getReadableStream() as Readable;
    const headers = result.headers as Record<string, string | undefined> | undefined;

    // 从 Content-Disposition 头提取文件名
    let fileName = 'file.dat';
    const contentDisposition = headers?.['content-disposition'] ?? '';
    const filenameMatch = contentDisposition.match(/filename\*?="?([^";]+)"?/);
    if (filenameMatch) {
      // 处理 RFC 5987 编码 (filename*=UTF-8''encoded_name)
      let rawName = filenameMatch[1];
      if (rawName.includes("''")) {
        const encoded = rawName.split("''")[1];
        try {
          fileName = decodeURIComponent(encoded);
        } catch {
          fileName = rawName;
        }
      } else {
        fileName = rawName;
      }
    }

    // 从 Content-Type 头获取 MIME 类型
    const mimeType = headers?.['content-type']?.split(';')[0]?.trim() ?? 'application/octet-stream';

    // 从 Content-Length 头获取文件大小
    const contentLength = headers?.['content-length'];
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

    // 检查文件大小
    if (fileSize > 0 && fileSize > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(MAX_FILE_SIZE / 1024 / 1024)}MB`);
    }

    // 消费流，将内容读取到 Buffer 中（带超时保护）
    const bufferPromise = buffer(stream) as Promise<Buffer>;
    const timeoutPromise = new Promise<Buffer>((_, reject) =>
      setTimeout(() => reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`)), DOWNLOAD_TIMEOUT_MS),
    );

    const downloadedBuffer = await Promise.race([bufferPromise, timeoutPromise]);

    // 二次检查实际下载的缓冲区大小
    if (downloadedBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(downloadedBuffer.length / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(MAX_FILE_SIZE / 1024 / 1024)}MB`);
    }

    return {
      buffer: downloadedBuffer,
      fileName,
      mimeType,
      fileSize: downloadedBuffer.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download Feishu file (messageId=${messageId}, fileKey=${fileKey}): ${message}`);
  }
}

/**
 * 创建文件下载函数的工厂函数
 */
export function createFileDownloadHandler(client: Client) {
  return async (opts: { messageId: string; fileKey: string; type: 'image' | 'file' }) => {
    void opts.type; // messageResource.get 统一处理所有资源类型
    return await downloadFeishuFile(client, opts.messageId, opts.fileKey);
  };
}
