import { handleStudioRequest } from '../../../server/studio-service.mjs';

export function onRequest(context) {
  return handleStudioRequest(context.request, context.env);
}
