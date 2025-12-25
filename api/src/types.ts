export interface Env {
  AUDIO_BUCKET: R2Bucket
  VIDEO_BUCKET: R2Bucket
  saas_tss_db: D1Database // Matches wrangler.jsonc
  SESSION_SECRET: string
  MODAL_TOKEN?: string    // Added this just in case
}