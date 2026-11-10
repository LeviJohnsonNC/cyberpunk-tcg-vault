import { createMatchController } from './workerController';
import type { MatchRequest } from './protocol';

const respond = createMatchController();
self.addEventListener('message', ({ data }: MessageEvent<MatchRequest>) => self.postMessage(respond(data)));
