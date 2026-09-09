import { useEffect, useRef, useState } from 'react'

import './App.css'

const API_URL = import.meta.env.VITE_API_URL

const STUDY_ACTIONS = [
  {
    label: 'Sammanfatta',
    prompt: 'Sammanfatta materialet tydligt och kortfattat. Lyft fram de viktigaste punkterna.',
  },
  {
    label: 'Gör quiz',
    prompt: 'Gör ett quiz på materialet med 5 frågor. Vänta med facit tills jag har svarat.',
  },
  {
    label: 'Förklara enklare',
    prompt: 'Förklara materialet enklare, steg för steg, som för en nybörjare.',
  },
  {
    label: 'Gör flashcards',
    prompt: 'Skapa flashcards från materialet. Skriv varje kort som Fråga: ... och Svar: ...',
  },
]

function AssistantContent({ content }) {
  const lines = content.split(/\r\n?|\n/)
  const blocks = []
  let plainLines = []

  function flushText() {
    if (!plainLines.length) return
    blocks.push(
      <div className="assistant-text" key={`text-${blocks.length}`}>
        {plainLines.map((line, index) => {
          const kind = /^\s*\d+[.)]\s+/.test(line) ? 'numbered'
            : /^\s*[A-D][.)]\s+/i.test(line) ? 'option'
            : /^\s*[-*•]\s+/.test(line) ? 'bullet' : 'plain'
          return (
            <div className={`answer-line answer-line--${kind}`} key={index}>
              {line || '\u00a0'}
            </div>
          )
        })}
      </div>
    )
    plainLines = []
  }

  // Recognize labels only at the start of a line; leave unmatched text intact.
  const questionLabel = /^\s*(?:\*\*)?Fråga:(?:\*\*)?\s*(.*)$/i
  const answerLabel = /^\s*(?:\*\*)?Svar:(?:\*\*)?\s*(.*)$/i
  for (let index = 0; index < lines.length; index++) {
    const question = lines[index].match(questionLabel)
    let answerIndex = index + 1
    while (answerIndex < lines.length && !lines[answerIndex].trim()) answerIndex++
    const answer = question && lines[answerIndex]?.match(answerLabel)

    if (!question?.[1].trim() || !answer?.[1].trim()) {
      plainLines.push(lines[index])
      continue
    }

    flushText()
    const answerLines = [answer[1]]
    index = answerIndex
    while (index + 1 < lines.length && lines[index + 1].trim()
      && !questionLabel.test(lines[index + 1])) {
      answerLines.push(lines[++index])
    }
    blocks.push(
      <dl className="study-flashcard" key={`card-${blocks.length}`}>
        <dt><span className="flashcard-label">Fråga</span>{question[1]}</dt>
        <dd><span className="flashcard-label">Svar</span>{answerLines.join('\n')}</dd>
      </dl>
    )
  }
  flushText()

  return <div className="assistant-content">{blocks}</div>
}

function App() {
  const [pin, setPin] = useState('')
  const [token, setToken] = useState(
    () => sessionStorage.getItem('bonbotToken') || ''
  )
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => Boolean(sessionStorage.getItem('bonbotToken'))
  )
  const [loginError, setLoginError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(
    () => localStorage.getItem('bonbotTheme') || 'dark'
  )

  const chatRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bonbotTheme', theme)
  }, [theme])

  useEffect(() => {
    if (isLoggedIn && token) {
      loadMessages()
    }
  }, [isLoggedIn, token])

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages, isLoading, error])

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === 'dark' ? 'light' : 'dark'
    )
  }

  function clearSession() {
    sessionStorage.removeItem('bonbotToken')
    setToken('')
    setIsLoggedIn(false)
    setMessages([])
    setMessage('')
    setSelectedFile(null)
    setError('')
  }

  async function handleLogin() {
    setLoginError('')

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pin: pin,
        }),
      })

      if (response.status === 429) {
        setLoginError(
          'För många felaktiga försök. Försök igen senare. (om en timme tillåme)'
        )
        return
      }

      if (!response.ok) {
        setLoginError('Fel PIN-kod.')
        return
      }

      const data = await response.json()

      sessionStorage.setItem('bonbotToken', data.token)
      setToken(data.token)
      setIsLoggedIn(true)
      setPin('')
    } catch {
      setLoginError('Kunde inte ansluta till Bönbot.')
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } finally {
      clearSession()
    }
  }

  async function loadMessages() {
    try {
      const response = await fetch(`${API_URL}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        clearSession()
        return
      }

      if (!response.ok) {
        throw new Error()
      }

      const data = await response.json()
      setMessages(data)
    } catch {
      setError('Kunde inte hämta chatthistoriken.')
    }
  }

  function handleFileChange(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return

    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError(file.size === 0 ? 'Filen får inte vara tom.' : 'Filen får vara max 10 MB.')
      return
    }

    if (!/\.(pdf|txt|docx)$/i.test(file.name)) {
      setError('Endast PDF-, TXT- och DOCX-filer stöds.')
      return
    }

    setSelectedFile(file)
    setError('')
  }

  async function handleSend(studyPrompt = null) {
    const messageToSend = studyPrompt ?? message
    if (!messageToSend.trim() || isLoading) {
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const formData = selectedFile ? new FormData() : null
      if (formData) {
        formData.append('message', messageToSend)
        formData.append('file', selectedFile)
      }

      const response = await fetch(`${API_URL}/${selectedFile ? 'chat-with-file' : 'chat'}`, {
        method: 'POST',
        headers: {
          ...(!selectedFile && { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${token}`,
        },
        body: formData || JSON.stringify({
          message: messageToSend,
        }),
      })

      if (response.status === 401) {
        clearSession()
        return
      }

      if (!response.ok) {
        const errorText = await response.text()

        if (errorText) {
          try {
            const parsedError = JSON.parse(errorText)
            setError(typeof parsedError === 'string'
              ? parsedError
              : parsedError?.detail || parsedError?.title || 'Något gick fel. Försök igen.')
          } catch {
            setError(errorText)
          }
        } else {
          setError('Något gick fel. Försök igen.')
        }

        return
      }

      await response.json()
      setSelectedFile(null)

      if (studyPrompt === null) setMessage('')
      await loadMessages()
    } catch {
      setError('Något gick fel. Försök igen.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleClear() {
    const confirmed = window.confirm(
      'Är du säker på att du vill rensa hela chatten?'
    )

    if (!confirmed) {
      return
    }

    setError('')

    try {
      const response = await fetch(`${API_URL}/messages`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        clearSession()
        return
      }

      if (!response.ok) {
        throw new Error()
      }

      setMessages([])
    } catch {
      setError('Kunde inte rensa chatten.')
    }
  }

  function handleChatKeyDown(event) {
    if (event.key === 'Enter') {
      handleSend()
    }
  }

  function handlePinKeyDown(event) {
    if (event.key === 'Enter') {
      handleLogin()
    }
  }

  if (!isLoggedIn) {
    return (
      <main className="app-shell login-shell">
        <div className="chat-header">
          <div>
            <h1>Bönbot ❤️</h1>
            <span>Bönans personliga robot</span>
          </div>

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="Byt tema"
            title="Byt tema"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="login-panel">
          <div className="welcome-mark" aria-hidden="true">✦</div>
          <span className="eyebrow">EN LITEN PLATS FÖR DIG</span>
          <h2>Välkommen hem, Bön.</h2>
          <p className="login-intro">Tankar, små stunder och allt däremellan.</p>
          <label htmlFor="pin">Din PIN-kod</label>
          <input
            id="pin"
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            onKeyDown={handlePinKeyDown}
            placeholder="PIN-kod"
          />

          <button onClick={handleLogin}>
            Logga in
          </button>

          {loginError && (
            <p className="error-text">{loginError}</p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <div className="chat-header">
        <div>
          <h1>Bönbot ❤️</h1>
          <span>Bönans personliga robot</span>
        </div>

        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label="Byt tema"
          title="Byt tema"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="chat" ref={chatRef}>
        {messages.length === 0 && !isLoading && (
          <div className="empty-state">
            <div className="welcome-mark" aria-hidden="true">✦</div>
            <span className="eyebrow">BARA DU OCH BÖNBOT</span>
            <p>Hej 👋</p>
            <span>Skriv något till Bönbot för att börja chatta.</span>
          </div>
        )}

        {messages.map((item) => (
          <div
            key={item.id}
            className={`message ${
              item.role === 'user' ? 'user' : 'assistant'
            }`}
          >
            <strong>
              {item.role === 'user' ? 'Bön' : 'Bönbot'}
            </strong>
            {item.role === 'user'
              ? item.content
              : <AssistantContent content={item.content} />}
          </div>
        ))}

        {isLoading && (
          <p className="thinking">
            (Bönbot både tänker och skriver...)
          </p>
        )}

        {error && (
          <p className="error-text">{error}</p>
        )}
      </div>

      {selectedFile && (
        <div className="attachment-preview">
          <span title={selectedFile.name}>{selectedFile.name}</span>
          <button
            className="secondary-button"
            onClick={() => setSelectedFile(null)}
            disabled={isLoading}
            aria-label="Ta bort bifogad fil"
          >
            Ta bort ×
          </button>
        </div>
      )}

      <div className="study-actions" role="group" aria-label="Snabbval för studier">
        {STUDY_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className="study-action"
            onClick={() => handleSend(action.prompt)}
            disabled={isLoading}
            title={action.prompt}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="composer">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.docx"
          hidden
          onChange={handleFileChange}
          disabled={isLoading}
          aria-label="Välj en studiefil"
        />
        <button
          className="attachment-button"
          onClick={() => fileInputRef.current.click()}
          disabled={isLoading}
          aria-label="Bifoga en fil (max 10 MB)"
          title="Bifoga en fil (max 10 MB)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 6" />
          </svg>
        </button>
        <input
          type="text"
          aria-label="Meddelande till Bönbot"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder="Skriv ett meddelande..."
          disabled={isLoading}
        />

        <button onClick={() => handleSend()} disabled={isLoading}>
          {isLoading ? 'Skickar...' : 'Skicka'}
        </button>
      </div>

      <div className="actions">
        <button
          className="secondary-button"
          onClick={handleClear}
          disabled={isLoading}
        >
          Rensa chatten
        </button>

        <button
          className="secondary-button"
          onClick={handleLogout}
          disabled={isLoading}
        >
          Logga ut
        </button>
      </div>
    </main>
  )
}

export default App
