import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import { inspect } from 'node:util';
import type { Client } from '@larksuiteoapi/node-sdk';

/** 允许下载的最大文件大小（50MB） */
const MAX_FILE_SIZE = 50 * 1024 * 1024;
/** 下载超时时间（60秒） */
const DOWNLOAD_TIMEOUT_MS = 60_000;

function serializeDiagnosticValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  return inspect(value, {
    depth: 6,
    breakLength: 120,
    compact: true,
    sorted: true,
  });
}

function formatDownloadErrorDetails(error: unknown): string {
  const parts: string[] = [];
  const record = error as Record<string, unknown> | null;
  if (record !== null && typeof record === 'object') {
    const status = record.status ?? record.statusCode ?? record.responseStatus;
    if (status !== undefined) {
      parts.push(`status=${serializeDiagnosticValue(status)}`);
    }

    const code = record.code ?? record.errorCode;
    if (code !== undefined) {
      parts.push(`code=${serializeDiagnosticValue(code)}`);
    }

    const response = record.response as Record<string, unknown> | undefined;
    if (response !== undefined) {
      const responseStatus = response.status ?? response.statusCode;
      if (responseStatus !== undefined) {
        parts.push(`response.status=${serializeDiagnosticValue(responseStatus)}`);
      }

      const responseData = response.data ?? response.body;
      if (responseData !== undefined) {
        parts.push(`response.data=${serializeDiagnosticValue(responseData)}`);
      }
    }
  }

  const request = record?.request as Record<string, unknown> | undefined;
  if (request !== undefined) {
    const method = request.method;
    const url = request.url ?? request.path;
    if (method !== undefined || url !== undefined) {
      parts.push(`request=${[method, url].filter((part) => part !== undefined).map((part) => serializeDiagnosticValue(part)).join(' ')}`);
    }
  }

  return parts.length > 0 ? parts.join(' | ') : 'no extra error details';
}

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
 * 所有资源（图片/文件）统一使用 `im.v1.messageResource.get` API。
 * 注意：`im.v1.image.get` 只能下载机器人自己上传的图片，不能下载用户发送的图片。
 *
 * SDK 返回的是可读流（ReadableStream），需要消费流获取二进制内容。
 */
export async function downloadFeishuFile(
  client: Client,
  messageId: string,
  fileKey: string,
  type: 'image' | 'file' | 'audio' = 'file',
): Promise<DownloadedFile> {
  const requestType = type === 'audio' ? 'file' : type;
  const urlPath = `/open-apis/im/v1/messages/${messageId}/resources/${fileKey}?type=${requestType}`;

  console.log(`[file-downloader] downloading ${type}: messageId=${messageId}, fileKey=${fileKey}, url=${urlPath}`);

  try {
    // 统一使用 messageResource.get，type 参数指明资源类型（image 或 file）
    const result = await client.im.v1.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type: requestType },
    });

    console.log(`[file-downloader] API call succeeded, reading stream...`);

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
    console.log(`[file-downloader] stream read complete: size=${downloadedBuffer.length} bytes`);

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
    console.error(
      `[file-downloader] failed: type=${type} messageId=${messageId} fileKey=${fileKey} url=${urlPath} ${formatDownloadErrorDetails(error)}`,
    );
    throw new Error(`Failed to download Feishu ${type} (url=${urlPath}): ${message}`);
  }
}

/**
 * 创建文件下载函数的工厂函数
 */
export function createFileDownloadHandler(client: Client) {
  return async (opts: { messageId: string; fileKey: string; type: 'image' | 'file' | 'audio' }) => {
    return await downloadFeishuFile(client, opts.messageId, opts.fileKey, opts.type);
  };
}
