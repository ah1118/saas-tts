export interface Env {
  AUDIO_BUCKET: R2Bucket
  VIDEO_BUCKET: R2Bucket
  saas_tss_db: D1Database
  SESSION_SECRET: string
}
