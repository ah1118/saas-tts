"use client"

import { useState } from "react"

export default function VideoTranslatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState("")

  async function upload() {
    if (!file) return

    setStatus("Uploading...")

    const res = await fetch("/api/video/upload", {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    })

    if (!res.ok) {
      const text = await res.text()
      setStatus(`Error: ${text}`)
      return
    }

    const data = await res.json()
    setStatus(data.message || "Done")
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Video Translate</h1>

      <input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <br /><br />

      <button onClick={upload}>Upload Video</button>

      <p>{status}</p>
    </main>
  )
}
