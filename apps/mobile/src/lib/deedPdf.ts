import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import { PDFDocument } from 'pdf-lib';
import type { LocalFile } from '@/api/uploads';

/** Long edge of each page photo: sharp enough for Pittu to read, small enough to send. */
const PAGE_MAX = 2000;
/** A4 width in PDF points; each page keeps its photo's shape. */
const PAGE_WIDTH = 595;

/**
 * Joins photographed deed pages into one PDF, on the phone. The deed then
 * goes through exactly the same path as an uploaded PDF — stored, read by
 * Pittu, checked for duplicates and viewable in Documents.
 */
export async function photosToPdf(pages: ImagePickerAsset[]): Promise<LocalFile> {
  const pdf = await PDFDocument.create();
  for (const asset of pages) {
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > PAGE_MAX) {
      context.resize(asset.width >= asset.height ? { width: PAGE_MAX } : { height: PAGE_MAX });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    const jpg = await pdf.embedJpg(await new File(saved.uri).bytes());
    const height = (jpg.height / jpg.width) * PAGE_WIDTH;
    pdf.addPage([PAGE_WIDTH, height]).drawImage(jpg, { x: 0, y: 0, width: PAGE_WIDTH, height });
  }
  const bytes = await pdf.save();
  const file = new File(Paths.cache, `sale-deed-photos-${Date.now()}.pdf`);
  file.write(bytes);
  return {
    uri: file.uri,
    name: 'Sale deed (photographed).pdf',
    mimeType: 'application/pdf',
    size: bytes.length,
  };
}
