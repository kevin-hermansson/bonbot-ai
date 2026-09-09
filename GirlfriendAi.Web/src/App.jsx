import { useEffect, useRef, useState } from 'react'

import './App.css'

const API_URL = import.meta.env.VITE_API_URL

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
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(
    () => localStorage.getItem('bonbotTheme') || 'dark'
  )

  const chatRef = useRef(null)

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

  async function handleSend() {
    if (!message.trim() || isLoading) {
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: message,
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
            setError(parsedError)
          } catch {
            setError(errorText)
          }
        } else {
          setError('Något gick fel. Försök igen.')
        }

        return
      }

      await response.json()

      setMessage('')
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
            {item.content}
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

      <div className="composer">
        <input
          type="text"
          aria-label="Meddelande till Bönbot"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder="Skriv ett meddelande..."
          disabled={isLoading}
        />

        <button onClick={handleSend} disabled={isLoading}>
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
