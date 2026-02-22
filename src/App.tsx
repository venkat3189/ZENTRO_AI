/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Loader2, Trash2, Sparkles, Image as ImageIcon, X, ExternalLink, Globe } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  image?: string;
  sources?: { uri: string; title: string }[];
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'bot',
      content: "Hello! I'm your Gemini-powered assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || (selectedImage ? "Analyze this image" : ""),
      timestamp: new Date(),
      image: selectedImage || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const history = messages.map(msg => ({
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: [
          ...(msg.image ? [{ inlineData: { data: msg.image.split(',')[1], mimeType: 'image/jpeg' } }] : []),
          { text: msg.content }
        ]
      }));

      const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview",
        history: history,
        config: {
          systemInstruction: "Your name is Zentro. You are a highly capable, accurate, and professional AI assistant. You have access to Google Search to provide up-to-date and verified information. Always prioritize accuracy and depth in your responses. If you are unsure, use your search tools. You can also help with coding, creative writing, and complex analysis. You are multimodal and can analyze images provided by the user.",
          tools: [{ googleSearch: {} }],
        },
      });

      const botMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        {
          id: botMessageId,
          role: 'bot',
          content: '',
          timestamp: new Date(),
        },
      ]);

      const messageParts = [];
      if (userMessage.image) {
        messageParts.push({
          inlineData: {
            data: userMessage.image.split(',')[1],
            mimeType: 'image/jpeg'
          }
        });
      }
      messageParts.push({ text: userMessage.content });

      const streamResponse = await chat.sendMessageStream({ 
        message: { parts: messageParts } as any // sendMessageStream expects a string or Part[], but the SDK types are sometimes tricky
      });
      
      let fullResponse = '';
      let sources: { uri: string; title: string }[] = [];

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        fullResponse += c.text || '';
        
        // Extract grounding chunks if available
        const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
          const newSources = groundingChunks
            .filter(chunk => chunk.web)
            .map(chunk => ({ uri: chunk.web!.uri, title: chunk.web!.title }));
          
          // Merge unique sources
          sources = [...sources, ...newSources].filter((v, i, a) => a.findIndex(t => t.uri === v.uri) === i);
        }

        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === botMessageId ? { ...msg, content: fullResponse, sources: sources.length > 0 ? sources : undefined } : msg
          )
        );
      }
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'bot',
          content: "I'm sorry, I encountered an error. Please try again later.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'bot',
        content: "Chat cleared. How else can I help you?",
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden sm:my-4 sm:h-[calc(100vh-2rem)] sm:rounded-2xl border border-zinc-200">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-bottom border-zinc-100 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white shadow-lg">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="font-semibold text-zinc-900 tracking-tight">Zentro</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">AI Assistant</span>
            </div>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Clear Chat"
        >
          <Trash2 size={18} />
        </button>
      </header>

      {/* Chat Area */}
      <main 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scroll-smooth"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex w-full gap-3",
                message.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                message.role === 'user' ? "bg-zinc-100 text-zinc-600" : "bg-zinc-900 text-white"
              )}>
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              
              <div className={cn(
                "max-w-[80%] space-y-2",
                message.role === 'user' ? "items-end" : "items-start"
              )}>
                {message.image && (
                  <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-sm max-w-sm">
                    <img src={message.image} alt="Uploaded content" className="w-full h-auto" />
                  </div>
                )}
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm shadow-sm",
                  message.role === 'user' 
                    ? "bg-zinc-100 text-zinc-800 rounded-tr-none" 
                    : "bg-white border border-zinc-100 text-zinc-800 rounded-tl-none"
                )}>
                  <div className="markdown-body">
                    <Markdown>{message.content}</Markdown>
                  </div>
                  
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-zinc-100">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        <Globe size={10} />
                        Sources
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {message.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 bg-zinc-50 border border-zinc-100 rounded-md text-[10px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                          >
                            <span className="truncate max-w-[120px]">{source.title}</span>
                            <ExternalLink size={8} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "text-[10px] mt-2 opacity-40 font-medium",
                    message.role === 'user' ? "text-right" : "text-left"
                  )}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && messages[messages.length - 1].content === '' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white shrink-0">
              <Bot size={16} />
            </div>
            <div className="bg-white border border-zinc-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-zinc-400" />
              <span className="text-xs text-zinc-400 font-medium">Thinking...</span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-white border-t border-zinc-100">
        <div className="max-w-3xl mx-auto space-y-4">
          {selectedImage && (
            <div className="relative inline-block">
              <img 
                src={selectedImage} 
                alt="Selected" 
                className="w-20 h-20 object-cover rounded-xl border-2 border-zinc-900 shadow-md"
              />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 p-1 bg-zinc-900 text-white rounded-full shadow-lg hover:bg-zinc-800"
              >
                <X size={12} />
              </button>
            </div>
          )}
          
          <div className="relative flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-xl bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-all shrink-0 border border-zinc-200"
              title="Upload Image"
            >
              <ImageIcon size={20} />
            </button>
            
            <div className="relative flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type your message..."
                rows={1}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all resize-none max-h-32"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
              <div className="absolute right-3 bottom-3 text-[10px] text-zinc-400 font-medium hidden sm:block">
                Shift + Enter for new line
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !selectedImage) || isLoading}
              className={cn(
                "p-3 rounded-xl transition-all shadow-lg flex items-center justify-center shrink-0",
                (!input.trim() && !selectedImage) || isLoading
                  ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  : "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95"
              )}
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
