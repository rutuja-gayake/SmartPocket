import React, { useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

export default function AdvisorPage({ currentPeriod }) {
  const { showToast } = useToast();
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'advisor',
      text: 'Hi there! I am your Pocket AI Advisor. Ask me anything about your pocket money, whether you can afford a purchase, or how to save for your goals.'
    }
  ]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const sampleQuestions = [
    'Can I afford ₹800 sneakers this weekend?',
    'How can I save ₹2,000 before month end?',
    'Am I following my 50/30/20 budget guidelines?',
    'Where is most of my pocket money going?'
  ];

  const handleSend = async (questionText) => {
    const prompt = questionText || query;
    if (!prompt.trim()) return;

    const userMsg = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: prompt.trim()
    };
    setMessages(prev => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const res = await api.advisor.query({
        query: prompt.trim(),
        period: currentPeriod
      });

      const replyMsg = {
        id: `advisor_${Date.now()}`,
        sender: 'advisor',
        text: res.answer || res.message || 'I reviewed your finances. Keep an eye on your discretionary spending!'
      };
      setMessages(prev => [...prev, replyMsg]);
    } catch (err) {
      showToast(err.message || 'We could not complete your request. Please try again.', 'error');
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'advisor',
          text: "I couldn't analyze your finances right now. Please check your connection and try again."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
      {/* Advisor Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--color-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', fontSize: '1.2rem' }}>
          🤖
        </div>
        <div>
          <h3 style={{ fontSize: '1.05rem', margin: 0, color: 'var(--color-primary)' }}>Pocket AI Advisor</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>Smart, personalized financial guidance for students</p>
        </div>
      </div>

      {/* Chat Messages */}
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.map(m => (
          <div
            key={m.id}
            style={{
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              backgroundColor: m.sender === 'user' ? 'var(--color-primary)' : 'var(--color-surface-subtle)',
              color: m.sender === 'user' ? '#ffffff' : 'var(--color-text-main)',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '0.9rem',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap'
            }}
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', background: 'var(--color-surface-subtle)', padding: '12px 16px', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Pocket AI is analyzing your wallet...
          </div>
        )}
      </div>

      {/* Suggested Quick Questions */}
      <div style={{ padding: '8px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {sampleQuestions.map((q, idx) => (
          <button
            key={idx}
            className="suggestion-pill"
            style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}
            onClick={() => handleSend(q)}
            disabled={loading}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="advisor-input-bar">
        <input
          type="text"
          className="form-control"
          placeholder="Ask Pocket Advisor about your spending or goals..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          onClick={() => handleSend()}
          disabled={loading || !query.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

