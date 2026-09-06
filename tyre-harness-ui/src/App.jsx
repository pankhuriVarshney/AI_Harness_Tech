import { useEffect, useRef, useState } from 'react';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
} from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import { MapPin, MapPinOff, RotateCcw } from 'lucide-react';
import { createSession, sendMessage } from './api';
import DealCard from './components/DealCard';
import DistributorList from './components/DistributorList';
import TracePanel from './components/TracePanel';
import './app.css';

const WELCOME = {
  message:
    "Tell me what you're looking for — vehicle, usage, size or budget — in any language, and I'll match tyres, price a deal, and find your nearest stockist.",
  sender: 'harness',
  direction: 'incoming',
};

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const [messages, setMessages] = useState([WELCOME]);
  const [isTyping, setIsTyping] = useState(false);
  const [deal, setDeal] = useState(null);
  const [distributors, setDistributors] = useState(null);
  const [trace, setTrace] = useState([]);
  const [rightTab, setRightTab] = useState('deal');
  const [coords, setCoords] = useState(null);
  const [locationState, setLocationState] = useState('unset'); // unset | granted | denied

  const sessionIdRef = useRef(null);
  const sessionPromise = useRef(null);

  useEffect(() => {
    sessionPromise.current = createSession()
      .then((res) => {
        sessionIdRef.current = res.session_id;
        setSessionId(res.session_id);
      })
      .catch(() => setSessionError(true));
  }, []);

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationState('granted');
      },
      () => setLocationState('denied'),
      { timeout: 5000 }
    );
  }

  async function handleSend(text) {
    setMessages((prev) => [...prev, { message: text, sender: 'you', direction: 'outgoing' }]);
    setIsTyping(true);

    try {
      // The session call may still be in flight on the very first message.
      if (!sessionIdRef.current) await sessionPromise.current;
      const res = await sendMessage(sessionIdRef.current, text, coords);

      setMessages((prev) => [
        ...prev,
        {
          message: res.reply,
          sender: 'harness',
          direction: 'incoming',
          escalate: Boolean(res.escalate_to_human),
        },
      ]);
      setDeal(res.deal || null);
      setDistributors(res.distributors || null);
      setTrace(res.trace || []);
      if (res.deal || res.distributors) setRightTab('deal');
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          message:
            "Couldn't reach the harness backend. Confirm the API is running and VITE_API_BASE_URL is set correctly.",
          sender: 'harness',
          direction: 'incoming',
          escalate: true,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleReset() {
    setMessages([WELCOME]);
    setDeal(null);
    setDistributors(null);
    setTrace([]);
    setRightTab('deal');
    createSession()
      .then((res) => {
        sessionIdRef.current = res.session_id;
        setSessionId(res.session_id);
      })
      .catch(() => setSessionError(true));
  }

  return (
    <div className="shell">
      <header className="shell__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <div>
            <span className="brand__name">Tyre Deal Harness</span>
            <span className="brand__subtitle">Lead qualification &amp; personalization console</span>
          </div>
        </div>

        <div className="shell__header-actions">
          <button
            className={`ghost-button ${locationState === 'granted' ? 'ghost-button--active' : ''}`}
            onClick={requestLocation}
            title="Share location to enable distributor matching"
          >
            {locationState === 'denied' ? <MapPinOff size={15} /> : <MapPin size={15} />}
            {locationState === 'granted' ? 'Location shared' : 'Share location'}
          </button>
          <button className="ghost-button" onClick={handleReset}>
            <RotateCcw size={15} />
            New conversation
          </button>
        </div>
      </header>

      {sessionError && (
        <div className="banner banner--warning">
          Couldn't start a session with the harness API. Is the Flask backend running?
        </div>
      )}

      <main className="shell__body">
        <section className="chat-pane">
          <MainContainer responsive>
            <ChatContainer>
              <MessageList
                typingIndicator={isTyping ? <TypingIndicator content="Harness is working…" /> : null}
              >
                {messages.map((m, i) => (
                  <Message
                    key={i}
                    model={{
                      message: m.message,
                      sender: m.sender,
                      direction: m.direction,
                      position: 'single',
                    }}
                  >
                    {m.escalate && (
                      <Message.Footer>
                        <span className="escalation-tag">Escalated to a human specialist</span>
                      </Message.Footer>
                    )}
                  </Message>
                ))}
              </MessageList>
              <MessageInput
                placeholder="Describe the tyres you need…"
                onSend={handleSend}
                attachButton={false}
              />
            </ChatContainer>
          </MainContainer>
        </section>

        <aside className="side-pane">
          <div className="side-pane__tabs">
            <button
              className={`tab ${rightTab === 'deal' ? 'tab--active' : ''}`}
              onClick={() => setRightTab('deal')}
            >
              Deal &amp; distributor
            </button>
            <button
              className={`tab ${rightTab === 'trace' ? 'tab--active' : ''}`}
              onClick={() => setRightTab('trace')}
            >
              Agent trace
            </button>
          </div>

          <div className="side-pane__content">
            {rightTab === 'deal' ? (
              deal || distributors ? (
                <>
                  <DealCard deal={deal} />
                  <DistributorList distributors={distributors} />
                </>
              ) : (
                <p className="trace-empty">
                  No quote yet — a deal and distributor match will appear here once the harness has
                  enough information.
                </p>
              )
            ) : (
              <TracePanel trace={trace} />
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
