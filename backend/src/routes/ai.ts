import { Request, Response, Router } from 'express';
import {
  CommunicationAIError,
  generateCommunicationAIDraft,
  getCommunicationAIStatus,
} from '../lib/communicationAi';
import { CommunicationOCRError, extractTextFromScreenshotDataUrl } from '../lib/communicationOcr';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  res.json(getCommunicationAIStatus());
});

router.post('/communication-draft', async (req: Request, res: Response) => {
  try {
    const draft = await generateCommunicationAIDraft({
      projectName: typeof req.body?.projectName === 'string' ? req.body.projectName : '',
      customerName: typeof req.body?.customerName === 'string' ? req.body.customerName : '',
      referenceEmails: Array.isArray(req.body?.referenceEmails)
        ? req.body.referenceEmails.map((value: unknown) => String(value))
        : [],
      referenceKeywords: Array.isArray(req.body?.referenceKeywords)
        ? req.body.referenceKeywords.map((value: unknown) => String(value))
        : [],
      rawText: typeof req.body?.rawText === 'string' ? req.body.rawText : '',
      imageDataUrl: typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '',
    });

    res.json({ draft });
  } catch (error) {
    if (error instanceof CommunicationAIError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(error);
    res.status(500).json({ error: 'AI drafting failed.' });
  }
});

router.post('/communication-screenshot-ocr', async (req: Request, res: Response) => {
  try {
    const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
    const text = await extractTextFromScreenshotDataUrl(imageDataUrl);
    res.json({ text });
  } catch (error) {
    if (error instanceof CommunicationOCRError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(error);
    res.status(500).json({ error: 'Local OCR failed.' });
  }
});

export default router;
