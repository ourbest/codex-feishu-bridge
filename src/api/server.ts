import { createServer, type Server } from 'node:http';

import type { ApiDependencies } from './routes.ts';
import { createApiRequestHandler } from './routes.ts';

export function createApiServer(dependencies: ApiDependencies): Server {
  return createServer(createApiRequestHandler(dependencies));
}
