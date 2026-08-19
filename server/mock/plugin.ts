/**
 * Vite plugin that mounts the DEV-ONLY mock backend as dev-server middleware.
 *
 * Enabled only when VITE_MOCK_API !== 'false', so the same codebase can be
 * pointed at the real backend (VITE_API_BASE_URL) in other environments.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMockRequest } from './server';

export function mockApiPlugin(): Plugin {
  return {
    name: 'vcfo-mock-api',
    configureServer(server) {
      if (process.env.VITE_MOCK_API === 'false') return;
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) return next();
        const handled = await handleMockRequest(req, res);
        if (!handled) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Unknown API route.' }));
        }
      });
    },
  };
}
