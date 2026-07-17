import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

interface PlaceholderMap {
  [key: string]: string;
}

/**
 * Generate a personalized PDF by replacing placeholders in a template
 * This is a simplified version - for production, consider using a library like pdf-lib
 */
export async function generatePersonalizedPdf(
  templatePath: string,
  placeholders: PlaceholderMap,
  outputPath: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add header
      doc.fontSize(24).text('Personalized Document', { align: 'center' });
      doc.moveDown();

      // Add content with replaced placeholders
      for (const [key, value] of Object.entries(placeholders)) {
        doc.fontSize(12).text(`${key}: ${value}`, { align: 'left' });
        doc.moveDown(0.5);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Extract placeholders from template text (e.g., {{email}}, {{company}})
 */
export function extractPlaceholders(text: string): string[] {
  const regex = /{{(\w+)}}/g;
  const placeholders: string[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }

  return placeholders;
}

/**
 * Replace placeholders in text with values
 */
export function replacePlaceholders(
  text: string,
  placeholders: PlaceholderMap
): string {
  let result = text;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
}
