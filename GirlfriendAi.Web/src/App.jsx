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

  const chatRef = useRef(null)

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
        throw new Error()
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
      <main>
        <h1>Bönbot</h1>

        <input
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          onKeyDown={handlePinKeyDown}
          placeholder="PIN-kod"
        />

        <button onClick={handleLogin}>
          Logga in
        </button>

        {loginError && <p>{loginError}</p>}
      </main>
    )
  }

  return (
    <main>
      <h1>Bönbot</h1>

      <div className="chat" ref={chatRef}>
        {messages.map((item) => (
          <div
            key={item.id}
            className={`message ${
              item.role === 'user' ? 'user' : 'assistant'
            }`}
          >
            <strong>
              {item.role === 'user' ? 'Du' : 'Bönbot'}:
            </strong>{' '}
            {item.content}
          </div>
        ))}

        {isLoading && <p>(Bönbot både tänker och skriver...)</p>}

        {error && <p>{error}</p>}
      </div>

      <input
        type="text"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleChatKeyDown}
        placeholder="Skriv ett meddelande..."
        disabled={isLoading}
      />

      <button onClick={handleSend} disabled={isLoading}>
        {isLoading ? 'Skickar...' : 'Skicka'}
      </button>

      <button onClick={handleClear} disabled={isLoading}>
        Rensa chatten
      </button>

      <button onClick={handleLogout} disabled={isLoading}>
        Logga ut
      </button>
    </main>
  )
}

export default App