"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://api.oussamalger6.workers.dev"

type JobStatus = "idle" | "queued" | "done" | "failed"

export default function TTSPage() {
  const router = useRouter()

  const [apiKey, setApiKey] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)

  const [text, setText] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus>("idle")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 🔒 Protect page + load credits
  useEffect(() => {
    const key = localStorage.getItem("saas_tts_api_key")
    if (!key) {
      router.push("/")
      return
    }

    setApiKey(key)

    // load credits
    fetch(`${API_BASE}/me`, {
      headers: {
        "Authorization": `Bearer ${key}`,
      },
    })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.credits === "number") {
          setCredits(d.credits)
        }
      })
      .catch(() => {})
  }, [router])

  // 🔁 Poll job status
  useEffect(() => {
    if (!jobId || !apiKey || status !== "queued") return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/tts/${jobId}`, {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
          },
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
  }, [jobId, apiKey, status])

  async function submitTTS() {
    if (!text.trim() || !apiKey) return

    setLoading(true)
    setError(null)
    setAudioUrl(null)
    setStatus("idle")

    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ text }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "TTS request failed")
      }

      setJobId(data.jobId)
      setStatus("queued")

      // deduct credits locally (backend already did)
      setCredits((c) => (c !== null ? c - text.length : c))
    } catch (e: any) {
      setError(e.message || "Something went wrong")
      setStatus("failed")
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem("saas_tts_api_key")
    localStorage.removeItem("saas_tts_user_id")
    router.push("/")
  }

  return (
    <main className="p-10 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Text to Speech</h1>

        <div className="flex items-center gap-4">
          {credits !== null && (
            <span className="text-sm text-gray-600">
              Credits: <strong>{credits}</strong>
            </span>
          )}

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
        onChange={(e) => setText(e.target.value)}
        disabled={loading || status === "queued"}
      />

      <button
        onClick={submitTTS}
        disabled={loading || status === "queued"}
        className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
      >
        {loading
          ? "Submitting…"
          : status === "queued"
          ? "Processing…"
          : "Generate TTS"}
      </button>

      {status === "queued" && (
        <p className="mt-4 text-gray-600">GPU job running… please wait</p>
      )}

      {error && (
        <p className="mt-4 text-red-600">{error}</p>
      )}

      {audioUrl && (
        <audio controls autoPlay className="mt-6 w-full">
          <source src={audioUrl} type="audio/wav" />
        </audio>
      )}
    </main>
  )
}
