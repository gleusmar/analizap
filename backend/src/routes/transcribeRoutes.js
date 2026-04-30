import express from 'express';
import { transcribeAudio } from '../controllers/transcribeController.js';

const router = express.Router();

router.post('/transcribe', transcribeAudio);

export default router;
