import { json } from 'express';
import type { RequestHandler } from 'express';

// Register before Nest's default parser. Only email-template JSON receives the
// 1 MiB envelope needed for 150,000 characters of UTF-8 HTML; other APIs retain
// the existing default. Core independently validates the field bounds.
export const EMAIL_TEMPLATES_BODY_PATH =
  '/api/whitelabels/:whitelabelId/emails/templates';
const parser = json({ limit: '1mb' });

// Keep a distinct middleware name. Nest detects an existing global jsonParser
// by function name; directly mounting that name here would suppress its normal
// JSON parser on unrelated routes during app.init().
export const emailTemplatesBodyParser: RequestHandler = (req, res, next) => {
  parser(req, res, next);
};
