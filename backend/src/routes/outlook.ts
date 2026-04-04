import { Request, Response, Router } from 'express';
import { launchOutlookDesktopSearch, OutlookDesktopError } from '../lib/outlookDesktop';

const router = Router();

router.post('/launch-search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query : '';

    await launchOutlookDesktopSearch(query);

    res.json({ status: 'launched' });
  } catch (error) {
    if (error instanceof OutlookDesktopError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(error);
    res.status(500).json({ error: 'Outlook search could not be launched.' });
  }
});

export default router;
