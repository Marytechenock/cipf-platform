import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { ChatMessage, User } from '../types';
import { Send, Bot, User as UserIcon, SendHorizonal, Star, Sparkles, CheckCircle2, RotateCcw, MessageSquareHeart } from 'lucide-react';

interface ChatbotProps {
  user: User;
  onFeedbackSaved: () => void;
}

export default function Chatbot({ user, onFeedbackSaved }: ChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [submissionData, setSubmissionData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize chatbot conversation
  useEffect(() => {
    // Check if user has already submitted feedback
    const fetchStatus = async () => {
      try {
        await api.getSessions();
        // Use polite initial text
        setMessages([
          {
            sender: 'bot',
            text: `Hello ${user.firstName}! Welcome to your MAZ event assistant.
            
I can help with programme sessions, dress codes, speakers, sponsors, venue details, activities, gallery/photo links, voting guidance, live Q&A, and event feedback.

You can ask me anything about the Strategic Marketing & Business Growth Indaba, or start the feedback interview.

To begin feedback:
**1. On a scale of 1 to 5, how would you rate the overall programme?**`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } catch (e) {
        console.error(e);
      }
    };
    fetchStatus();
  }, [user]);

  // Keep scrolled to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading || isCompleted) return;

    const userMsg: ChatMessage = {
      sender: 'user',
      text: inputValue.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      // Send chat history to backend API
      const result = await api.sendChatMessage(newMessages);
      const replyText = result.reply;

      const botMsg: ChatMessage = {
        sender: 'bot',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, botMsg]);

      // Check if reply contains the feedback JSON block
      const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
      const match = replyText.match(jsonRegex);
      if (match) {
        try {
          const parsedData = JSON.parse(match[1]);
          if (parsedData && parsedData.feedbackData) {
            // Found feedback JSON block! Trigger DB submission automatically
            const fbSubmit = parsedData.feedbackData;
            
            await api.submitFeedback({
              rating: fbSubmit.rating || 5,
              bestSession: fbSubmit.bestSession || 'N/A',
              bestFacilitator: fbSubmit.bestFacilitator || 'N/A',
              improvements: fbSubmit.improvements || '',
              attendAgain: fbSubmit.attendAgain !== false,
              chatTranscript: [...newMessages, botMsg]
            });

            setSubmissionData(fbSubmit);
            setIsCompleted(true);
            
            // Clean JSON block out of display messages to keep chat look flawless
            setMessages((prev) => {
              const cleaned = [...prev];
              const last = cleaned[cleaned.length - 1];
              if (last && last.sender === 'bot') {
                last.text = last.text.replace(jsonRegex, '').trim() + 
                  '\n\n🎉 *Thank you! Your feedback form has been successfully locked in our system databases.*';
              }
              return cleaned;
            });

            onFeedbackSaved();
          }
        } catch (err) {
          console.error('Failed to parse final feedback json block:', err);
        }
      }

    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: '⚠️ Apologies, I ran into an error connecting to the AI platform. Please try sending that message again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        sender: 'bot',
        text: `Hello ${user.firstName}! Welcome back to your MAZ event assistant. Let's restart the feedback interview.
        
**1. On a scale of 1 to 5, how would you rate the overall programme?**`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setInputValue('');
    setIsCompleted(false);
    setSubmissionData(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[500px]">
      
      {/* Sidebar Progress Tracker */}
      <div className="lg:col-span-1 rounded-2xl bg-[#1A1A1A] text-white p-5 border border-[#B8922A]/20 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#FFD700] mb-4">
            <Bot className="h-5 w-5 animate-bounce" />
            <span className="text-xs font-bold uppercase tracking-wider">AI Event Assistant</span>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed mb-6">
            Ask about the live event information or complete the guided feedback interview.
          </p>

          <div className="space-y-4 text-xs font-medium">
            <div className={`flex items-start gap-2.5 transition-all ${isCompleted ? 'text-emerald-400 font-bold' : 'text-gray-300'}`}>
              <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-gray-600'}`} />
              <div>
                <p className="font-bold">1. Program Rating</p>
                <p className="text-[10px] text-gray-500 font-medium">1 - 5 numeric evaluation scale</p>
              </div>
            </div>

            <div className={`flex items-start gap-2.5 transition-all ${isCompleted ? 'text-emerald-400 font-bold' : 'text-gray-300'}`}>
              <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-gray-600'}`} />
              <div>
                <p className="font-bold">2. Best Session</p>
                <p className="text-[10px] text-gray-500 font-medium">Strategic takeaway preference</p>
              </div>
            </div>

            <div className={`flex items-start gap-2.5 transition-all ${isCompleted ? 'text-emerald-400 font-bold' : 'text-gray-300'}`}>
              <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-gray-600'}`} />
              <div>
                <p className="font-bold">3. Standout Facilitator</p>
                <p className="text-[10px] text-gray-500 font-medium">Exceptional speaker highlight</p>
              </div>
            </div>

            <div className={`flex items-start gap-2.5 transition-all ${isCompleted ? 'text-emerald-400 font-bold' : 'text-gray-300'}`}>
              <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-gray-600'}`} />
              <div>
                <p className="font-bold">4. Improvements Note</p>
                <p className="text-[10px] text-gray-500 font-medium">Valuable constructive tips</p>
              </div>
            </div>

            <div className={`flex items-start gap-2.5 transition-all ${isCompleted ? 'text-emerald-400 font-bold' : 'text-gray-300'}`}>
              <CheckCircle2 className={`h-4.5 w-4.5 shrink-0 ${isCompleted ? 'text-emerald-400' : 'text-gray-600'}`} />
              <div>
                <p className="font-bold">5. Future Attendance</p>
                <p className="text-[10px] text-gray-500 font-medium">Re-attendance check</p>
              </div>
            </div>
          </div>
        </div>

        {isCompleted && (
          <div className="mt-6 border-t border-gray-800 pt-5 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider mb-4 animate-pulse">
              <CheckCircle2 className="h-4 w-4" /> Assessment Saved
            </span>
            <button
              onClick={handleReset}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-700 hover:border-[#FFD700] hover:text-[#FFD700] py-2 text-xs font-bold tracking-wide transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start New Interview
            </button>
          </div>
        )}
      </div>

      {/* Main Chat Interface */}
      <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-xl flex flex-col justify-between overflow-hidden">
        
        {/* Chat Window Top Bar */}
        <div className="bg-[#1A1A1A] p-4 flex items-center justify-between border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#8B6914] to-[#FFD700] text-black">
              <Bot className="h-5 w-5 stroke-[2]" />
            </div>
            <div>
              <p className="text-xs font-black text-[#FFD700] tracking-wider uppercase">MAZ Feedback Assistant</p>
              <p className="text-[10px] text-gray-400 font-bold tracking-tight">Active Conversation &bull; Secure Protocol</p>
            </div>
          </div>
          <div className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Client
          </div>
        </div>

        {/* Chat Messages Log */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[380px] min-h-[320px] bg-[#FAF8F5] leading-relaxed">
          {messages.map((msg, idx) => {
            const isBot = msg.sender === 'bot';
            return (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${isBot ? 'mr-auto items-start' : 'ml-auto flex-row-reverse items-start'}`}
              >
                {/* Profile Icon */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isBot ? 'bg-[#1A1A1A] text-[#FFD700]' : 'bg-[#B8922A] text-black'
                }`}>
                  {isBot ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                </div>

                {/* Bubble message */}
                <div className="flex flex-col">
                  <div className={`rounded-2xl p-4 text-xs font-medium leading-relaxed ${
                    isBot 
                      ? 'bg-white border border-gray-150 text-gray-800 shadow-sm rounded-tl-none' 
                      : 'bg-[#1A1A1A] text-white shadow rounded-tr-none'
                  }`}>
                    {/* Render message formatting dynamically */}
                    <div className="whitespace-pre-line text-xs">
                      {msg.text}
                    </div>
                  </div>
                  <span className={`text-[9px] text-gray-400 mt-1 font-semibold ${isBot ? 'text-left' : 'text-right'}`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Assistant thinking indicator */}
          {isLoading && (
            <div className="flex gap-3 max-w-[80%] mr-auto items-start">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A1A1A] text-[#FFD700]">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl p-4 bg-white border border-gray-150 shadow-sm rounded-tl-none flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#B8922A] animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2 w-2 rounded-full bg-[#B8922A] animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-2 rounded-full bg-[#B8922A] animate-bounce" />
              </div>
            </div>
          )}

          {/* Finish Screen Card */}
          {isCompleted && submissionData && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 mt-6 text-gray-800 animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-700 font-black text-xs uppercase mb-3 tracking-widest">
                <Sparkles className="h-4 w-4 text-emerald-600 animate-spin" /> Official Copy Submitted
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded border border-emerald-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Total Score</p>
                  <div className="flex items-center gap-1">
                    <span className="font-extrabold text-amber-500 text-sm">{submissionData.rating}</span>
                    <div className="flex text-amber-500">
                      {[...Array(submissionData.rating)].map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-amber-500 text-amber-500" />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bg-white p-2.5 rounded border border-emerald-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Attend in Future</p>
                  <p className="font-black text-emerald-700">{submissionData.attendAgain ? 'Yes, Definitely!' : 'No'}</p>
                </div>
                <div className="col-span-2 bg-white p-2.5 rounded border border-emerald-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Key Takeaway Session</p>
                  <p className="font-semibold text-gray-800 italic">"{submissionData.bestSession}"</p>
                </div>
                <div className="col-span-2 bg-white p-2.5 rounded border border-emerald-100">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Standout Facilitator</p>
                  <p className="font-bold text-gray-800">{submissionData.bestFacilitator}</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 font-bold text-center mt-3 tracking-wider uppercase">
                &bull; Persistent Local Storage Registered &bull; Thank you! &bull;
              </p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Messaging Input Form */}
        <form onSubmit={handleSend} className="p-3 border-t border-gray-200 bg-white flex gap-2">
          <input
            type="text"
            id="chatbot-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading || isCompleted}
            placeholder={isCompleted ? "Evaluation session finished successfully" : "Type your feedback response..."}
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-xs font-semibold focus:border-[#B8922A] focus:outline-none focus:ring-1 focus:ring-[#B8922A] disabled:bg-gray-100 placeholder:text-gray-400"
          />
          <button
            type="submit"
            id="chatbot-send-btn"
            disabled={!inputValue.trim() || isLoading || isCompleted}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A1A1A] text-[#FFD700] hover:bg-neutral-800 focus:outline-none shadow transition-all disabled:bg-gray-200 disabled:text-gray-400 shrink-0"
            title="Send Message"
          >
            <SendHorizonal className="h-5 w-5" />
          </button>
        </form>

      </div>
    </div>
  );
}
