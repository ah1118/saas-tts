"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://api.oussamalger6.workers.dev"

type JobStatus = "idle" | "queued" | "done" | "failed"

export default function TTSPage() {
  const router = useRouter()

  const [loadingAuth, setLoadingAuth] = useState(true)
  const [credits, setCredits] = useState<number>(0)

  const [text, setText] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus>("idle")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 🔒 Auth check (COOKIE-BASED)
  useEffect(() => {
    fetch(`${API_BASE}/me`, {
      credentials: "include",
    })
      .then(async res => {
        if (!res.ok) {
          router.replace("/")
          return
        }
        const data = await res.json()
        setCredits(data.credits)
      })
      .finally(() => {
        setLoadingAuth(false)
      })
  }, [router])

  // 🔁 Poll job status
  useEffect(() => {
    if (!jobId || status !== "queued") return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/tts/${jobId}`, {
          credentials: "include",
        })
        const data = await res.json()

        if (data.status === "done") {
          setAudioUrl(data.url)
          setStatus("done")
          clearInterval(interval)
        }

        if (data.status === "failed") {
          setError(data.error || "Job failed")
          setStatus("failed")
          clearInterval(interval)
        }
      } catch {
        setError("Failed to poll job")
        setStatus("failed")
        clearInterval(interval)
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [jobId, status])

  async function submitTTS() {
    if (!text.trim()) return

    setSubmitting(true)
    setError(null)
    setAudioUrl(null)
    setStatus("idle")

    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "TTS request failed")
      }

      setJobId(data.jobId)
      setStatus("queued")
      setCredits(c => c - text.length)
    } catch (e: any) {
      setError(e.message || "Something went wrong")
      setStatus("failed")
    } finally {
      setSubmitting(false)
    }
  }

  function logout() {
    fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      router.replace("/")
    })
  }

  // ⛔ Block render until auth check finishes
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Checking session…
      </div>
    )
  }

  return (
    <main className="p-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Text to Speech</h1>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Credits: <strong>{credits}</strong>
          </span>
          <button onClick={logout} className="text-sm underline">
            Logout
          </button>
        </div>
      </div>

      <textarea
        className="w-full border p-3 mb-4"
        rows={5}
        placeholder="Enter text to synthesize"
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={submitting || status === "queued"}
      />

      <button
        onClick={submitTTS}
        disabled={submitting || status === "queued"}
        className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
      >
        {submitting
          ? "Submitting…"
          : status === "queued"
          ? "Processing…"
          : "Generate TTS"}
      </button>

      {status === "queued" && (
        <p className="mt-4 text-gray-600">GPU job running…</p>
      )}

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {audioUrl && (
        <audio controls autoPlay className="mt-6 w-full">
          <source src={audioUrl} type="audio/wav" />
        </audio>
      )}
    </main>
  )
}
