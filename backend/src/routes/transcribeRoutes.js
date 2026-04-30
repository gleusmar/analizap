import express from 'express';
import { transcribeAudio } from '../controllers/transcribeController.js';

const router = express.Router();

router.post('/transcribe', express.json(), transcribeAudio);

export default router;
