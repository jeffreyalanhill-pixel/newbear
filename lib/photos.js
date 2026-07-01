// lib/photos.js — Job photo attachment helpers
//
// DEMO MODE: Compressed image data URLs are stored directly on job records
// in localStorage (job.photos[].thumbnailDataUrl + imageDataUrl). This works
// for small shops with a few photos per job but will hit localStorage quota
// (~5 MB) quickly under real load.
//
// TODO (production): Replace imageDataUrl storage with Supabase Storage.
//   - Upload file to Supabase Storage at path: {shop_id}/{job_id}/{photo_id}.jpg
//   - Store only the storage_path + thumbnail_path on the record
//   - Mirror metadata to `job_photos` Postgres table (see schema below)
//   - Apply RLS: restrict reads to shop_id matching the authenticated user's shop
//   - Separate customer-visible photos via is_customer_visible flag at query time
//
// Future Supabase table (do NOT create yet):
//   job_photos(id, shop_id, job_id, customer_id, vehicle_id, category,
//              storage_path, thumbnail_path, label, notes,
//              is_customer_visible, created_by, created_at)

import { db } from './data.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const PHOTO_CATEGORIES = [
  { id: 'intake',            label: 'Intake' },
  { id: 'damage',            label: 'Damage' },
  { id: 'vin',               label: 'VIN' },
  { id: 'odometer',          label: 'Odometer' },
  { id: 'before',            label: 'Before' },
  { id: 'during',            label: 'During' },
  { id: 'after',             label: 'After' },
  { id: 'parts',             label: 'Parts' },
  { id: 'inspection',        label: 'Inspection' },
  { id: 'customer_approval', label: 'Customer Approval' },
  { id: 'other',             label: 'Other' },
];

export const PHOTO_CATEGORY_MAP = Object.fromEntries(
  PHOTO_CATEGORIES.map((c) => [c.id, c.label])
);

const THUMB_MAX_PX  = 320;
const THUMB_QUALITY = 0.72;
const IMAGE_MAX_PX  = 1200;
const IMAGE_QUALITY = 0.80;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB input cap; compressed output is much smaller

const ACCEPTED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/avif', 'image/bmp',
]);

// ── Image compression ─────────────────────────────────────────────────────────

// Returns a data URL of the image resized to maxWidth × proportional height.
// Rejects with a user-friendly message on failure.
export function resizeImageFile(file, maxWidth = IMAGE_MAX_PX, quality = IMAGE_QUALITY) {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_MIME.has(file.type)) {
      reject(new Error(`Unsupported file type: ${file.type || 'unknown'}. Please use JPEG, PNG, WebP, or GIF.`));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      reject(new Error(`File too large (${formatPhotoSize(file.size)}). Maximum is 20 MB.`));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image. The file may be corrupted.'));
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Record factories ──────────────────────────────────────────────────────────

// Creates a full photo metadata record from a File and the two compressed data URLs.
// opts: { category, label, notes, isCustomerVisible, createdBy }
export function buildPhotoRecord(file, thumbResult, imageResult, opts = {}) {
  return {
    id:               db.nextId('photo'),
    category:         opts.category         || 'other',
    label:            opts.label            || '',
    notes:            opts.notes            || '',
    isCustomerVisible: opts.isCustomerVisible ?? false,
    createdAt:        new Date().toISOString(),
    createdBy:        opts.createdBy        || 'demo-user',
    fileName:         file.name,
    mimeType:         'image/jpeg',         // always JPEG after canvas encode
    sizeBytes:        file.size,
    width:            imageResult.width,
    height:           imageResult.height,
    thumbnailDataUrl: thumbResult.dataUrl,
    imageDataUrl:     imageResult.dataUrl,
  };
}

// Compresses a file into a full photo record ready to attach.
// Throws a user-friendly error on failure.
export async function createPhotoRecord(file, opts = {}) {
  const [thumbResult, imageResult] = await Promise.all([
    resizeImageFile(file, THUMB_MAX_PX, THUMB_QUALITY),
    resizeImageFile(file, IMAGE_MAX_PX, IMAGE_QUALITY),
  ]);
  return buildPhotoRecord(file, thumbResult, imageResult, opts);
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function getJobPhotos(jobId) {
  const job = db.jobById(jobId);
  return Array.isArray(job?.photos) ? job.photos : [];
}

export function addJobPhoto(jobId, photoRecord) {
  const jobs = db.jobs();
  const idx  = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) throw new Error('Job not found');
  const job = { ...jobs[idx] };
  job.photos = Array.isArray(job.photos) ? [...job.photos, photoRecord] : [photoRecord];
  jobs[idx] = job;
  db.saveJobs(jobs);
  return job;
}

export function removeJobPhoto(jobId, photoId) {
  const jobs = db.jobs();
  const idx  = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) throw new Error('Job not found');
  const job = { ...jobs[idx] };
  job.photos = (job.photos || []).filter((p) => p.id !== photoId);
  jobs[idx] = job;
  db.saveJobs(jobs);
  return job;
}

export function updateJobPhoto(jobId, photoId, patch) {
  const jobs = db.jobs();
  const idx  = jobs.findIndex((j) => j.id === jobId);
  if (idx < 0) throw new Error('Job not found');
  const job = { ...jobs[idx] };
  job.photos = (job.photos || []).map((p) => p.id === photoId ? { ...p, ...patch } : p);
  jobs[idx] = job;
  db.saveJobs(jobs);
  return job;
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatPhotoSize(bytes) {
  if (!bytes || bytes < 0) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
