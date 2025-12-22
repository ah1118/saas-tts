"use client"

import { useState } from "react"

export default function Home() {
  const [text, setText] = useState("")
  const [audio, setAudio] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    setAudio(null)

    const res = await fetch("https://api.oussamalger6.workers.dev/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    })

    const data = await res.json()
    setAudio(data.url)
    setLoading(false)
  }

  return (
    <main className="p-10 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">SaaS TTS</h1>

      <textarea
        className="w-full border p-2 mb-4"
        rows={4}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Enter text"
      />

      <button
        onClick={generate}
        disabled={loading}
        className="px-4 py-2 bg-black text-white rounded"
      >
        {loading ? "Generating..." : "Generate TTS"}
      </button>

      {audio && (
        <audio controls className="mt-4 w-full">
          <source src={audio} type="audio/wav" />
        </audio>
      )}
    </main>
  )
}
