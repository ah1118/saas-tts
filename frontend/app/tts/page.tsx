"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const API_BASE = "https://api.oussamalger6.workers.dev"

export default function TTSPage() {
  const router = useRouter()

  const [credits, setCredits] = useState<number | null>(null)
  const [text, setText] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 🔐 Protect page using cookie session
  useEffect(() => {
    fetch(`${API_BASE}/me`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          router.push("/")
          return
        }
        const data = await res.json()
        setCredits(data.credits)
      })
      .catch(() => {
        router.push("/")
      })
  }, [router])

  async function submitTTS() {
    if (!text.trim()) return

    setLoading(true)
    setError(null)
    setAudioUrl(null)

    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "TTS failed")
      }

      // ✅ Worker returns signed R2 URL
      setAudioUrl(data.url)

      // Optimistic credit update
      setCredits((c) => (c !== null ? c - text.length : c))
    } catch (e: any) {
      setError(e.message || "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await fetch(`${API_BASE}/logout`, {
      method: "POST",
      credentials: "include",
    })
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
        disabled={loading}
      />

      <button
        onClick={submitTTS}
        disabled={loading}
        className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate TTS"}
      </button>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {audioUrl && (
        <div className="mt-6 space-y-3">
          <audio controls autoPlay className="w-full">
            <source src={audioUrl} type="audio/wav" />
          </audio>

          <a
            href={audioUrl}
            download
            className="inline-block text-sm underline"
          >
            Download WAV
          </a>
        </div>
      )}
    </main>
  )
}
