import { Router } from 'express';
import { createRequestProfiler, profileStep } from '../request-profile.js';

export function createHomepageRouter(trackService) {
  const router = Router();
  router.get('/homepage', createHomepageHandler(trackService));
  return router;
}

export function createHomepageHandler(trackService) {
  return async (request, response) => {
    const profile = createRequestProfiler(request.log);
    const tracks = await profileStep(profile, 'homepage.load', () => trackService.getHomepageTracks(undefined, profile));
    response.setHeader('Cache-Control', 'no-store');
    response.json({ data: tracks });
  };
}
