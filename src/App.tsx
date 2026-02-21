/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Sparkles, 
  Volume2, 
  MessageSquare, 
  X, 
  Send, 
  Loader2, 
  Image as ImageIcon,
  ChevronRight,
  BookOpen,
  VolumeX,
  FileText,
  Globe,
  FileSpreadsheet,
  File as FileIcon
} from 'lucide-react';
import Markdown from 'react-markdown';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { analyzeSourceAndGenerateStory, generateSpeech, chatWithGemini } from './services/geminiService';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

type SourceType = 'image' | 'pdf' | 'url' | 'text';

export default function App() {
  const [sourceType, setSourceType] = useState<SourceType>('image');
  const [image, setImage] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const [story, setStory] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resetSource = () => {
    setImage(null);
    setPdfData(null);
    setExtractedText(null);
    setFileName(null);
    setMimeType(null);
    setStory(null);
    setAnalysis(null);
    setAudioUrl(null);
    setMessages([]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetSource();
    setFileName(file.name);
    setMimeType(file.type);

    const reader = new FileReader();

    if (file.type.startsWith('image/')) {
      setSourceType('image');
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImage(base64String);
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      setSourceType('pdf');
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setPdfData(base64String);
      };
      reader.readAsDataURL(file);
    } else if (file.name.endsWith('.docx')) {
      setSourceType('text');
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      setExtractedText(result.value);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      setSourceType('text');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_txt(sheet)}\n\n`;
      });
      setExtractedText(text);
    } else {
      // Fallback for other text files
      setSourceType('text');
      reader.onloadend = () => {
        setExtractedText(reader.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleGenerateStory = async () => {
    setIsAnalyzing(true);
    try {
      let sourcePayload: any;
      if (sourceType === 'image') {
        sourcePayload = { type: 'image', data: image, mimeType };
      } else if (sourceType === 'pdf') {
        sourcePayload = { type: 'pdf', data: pdfData, mimeType };
      } else if (sourceType === 'url') {
        sourcePayload = { type: 'url', url: urlInput };
      } else {
        sourcePayload = { type: 'text', text: extractedText };
      }

      const result = await analyzeSourceAndGenerateStory(sourcePayload);
      setStory(result.story);
      setAnalysis(result.analysis);
    } catch (error) {
      console.error('Error generating story:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleNarrate = async () => {
    if (!story) return;
    if (audioUrl) {
      if (audioRef.current?.paused) {
        audioRef.current.play();
        setIsNarrating(true);
      } else {
        audioRef.current?.pause();
        setIsNarrating(false);
      }
      return;
    }

    setIsNarrating(true);
    try {
      const base64Audio = await generateSpeech(story);
      if (base64Audio) {
        const blob = await fetch(`data:audio/wav;base64,${base64Audio}`).then(r => r.blob());
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
        }
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      setIsNarrating(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const response = await chatWithGemini(userMessage, {
        story: story || undefined,
        analysis: analysis || undefined,
        imageBase64: sourceType === 'image' ? image || undefined : undefined,
        imageMimeType: sourceType === 'image' ? mimeType || undefined : undefined
      });
      setMessages(prev => [...prev, { role: 'ai', content: response || 'I am sorry, I could not process that.' }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'ai', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5] font-sans selection:bg-emerald-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/10 blur-[120px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <BookOpen className="text-black w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Ink & Insight</h1>
        </div>
        <button 
          onClick={() => setIsChatOpen(true)}
          className="p-2 hover:bg-white/5 rounded-full transition-colors relative"
        >
          <MessageSquare className="w-6 h-6" />
          {messages.length > 0 && (
            <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0a0a0a]" />
          )}
        </button>
      </nav>

      <main className="relative z-10 max-w-6xl mx-auto px-8 py-12 grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* Left Column: Source Selection & Preview */}
        <section className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-light tracking-tight text-white">The Source</h2>
            <p className="text-white/50 font-light">Upload an image, PDF, document, or provide a URL.</p>
          </div>

          {/* Source Type Selector */}
          <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
            {[
              { id: 'image', icon: ImageIcon, label: 'Image' },
              { id: 'pdf', icon: FileText, label: 'PDF' },
              { id: 'url', icon: Globe, label: 'URL' },
              { id: 'text', icon: FileIcon, label: 'Doc' },
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => { setSourceType(type.id as SourceType); resetSource(); }}
                className={`
                  flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all
                  ${sourceType === type.id ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}
                `}
              >
                <type.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{type.label}</span>
              </button>
            ))}
          </div>

          <div className="relative group">
            {sourceType !== 'url' ? (
              <>
                <input
                  type="file"
                  accept={
                    sourceType === 'image' ? 'image/*' :
                    sourceType === 'pdf' ? 'application/pdf' :
                    '.docx,.xlsx,.xls,.txt'
                  }
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div className={`
                  aspect-[4/3] rounded-3xl border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center overflow-hidden
                  ${(image || pdfData || extractedText) ? 'border-transparent' : 'border-white/10 group-hover:border-emerald-500/50 bg-white/[0.02]'}
                `}>
                  {image ? (
                    <motion.img 
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={`data:${mimeType};base64,${image}`} 
                      className="w-full h-full object-cover"
                      alt="Uploaded inspiration"
                    />
                  ) : pdfData ? (
                    <div className="flex flex-col items-center gap-4 text-emerald-500">
                      <FileText className="w-16 h-16" />
                      <p className="text-sm font-medium">{fileName}</p>
                    </div>
                  ) : extractedText ? (
                    <div className="flex flex-col items-center gap-4 text-emerald-500 p-8 text-center">
                      {fileName?.endsWith('.xlsx') ? <FileSpreadsheet className="w-16 h-16" /> : <FileText className="w-16 h-16" />}
                      <p className="text-sm font-medium">{fileName}</p>
                      <p className="text-xs text-white/40 line-clamp-3">{extractedText.substring(0, 150)}...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-white/30 group-hover:text-emerald-500/70 transition-colors">
                      <div className="p-6 rounded-full bg-white/5 group-hover:bg-emerald-500/10 transition-colors">
                        <Upload className="w-10 h-10" />
                      </div>
                      <p className="text-sm font-medium uppercase tracking-widest">Drop your {sourceType} here</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="aspect-[4/3] rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center p-8 space-y-6">
                <div className="p-6 rounded-full bg-emerald-500/10 text-emerald-500">
                  <Globe className="w-10 h-10" />
                </div>
                <div className="w-full space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40">Website URL</label>
                  <input 
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500/50 transition-colors"
                  />
                </div>
              </div>
            )}
            
            {(image || pdfData || extractedText) && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={resetSource}
                className="absolute top-4 right-4 p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-red-500/50 transition-colors z-30"
              >
                <X className="w-5 h-5" />
              </motion.button>
            )}
          </div>

          {(image || pdfData || extractedText || (sourceType === 'url' && urlInput)) && !story && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleGenerateStory}
              disabled={isAnalyzing}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-black font-semibold rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-500/20"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Analyzing the source...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Summon the Muse</span>
                </>
              )}
            </motion.button>
          )}

          {analysis && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-6 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-500">Atmosphere</h3>
              <p className="text-white/70 font-light leading-relaxed italic">"{analysis}"</p>
            </motion.div>
          )}
        </section>

        {/* Right Column: Story Output */}
        <section className="space-y-8 min-h-[400px]">
          <div className="space-y-2">
            <h2 className="text-3xl font-light tracking-tight text-white">The Manuscript</h2>
            <p className="text-white/50 font-light">The story begins where the source ends.</p>
          </div>

          <AnimatePresence mode="wait">
            {story ? (
              <motion.div
                key="story"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="prose prose-invert max-w-none">
                  <div className="text-xl leading-relaxed font-serif text-white/90 first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-emerald-500">
                    <Markdown>{story}</Markdown>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-8 border-t border-white/5">
                  <button
                    onClick={handleNarrate}
                    className={`
                      flex items-center gap-3 px-6 py-3 rounded-full font-medium transition-all
                      ${isNarrating ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white hover:bg-white/10'}
                    `}
                  >
                    {isNarrating ? (
                      <>
                        <VolumeX className="w-5 h-5" />
                        <span>Pause Narration</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-5 h-5" />
                        <span>Read Aloud</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={() => setIsChatOpen(true)}
                    className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 text-white hover:bg-white/10 font-medium transition-all"
                  >
                    <MessageSquare className="w-5 h-5" />
                    <span>Discuss World</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[400px] rounded-3xl border border-white/5 bg-white/[0.01] flex flex-col items-center justify-center text-white/20 gap-4"
              >
                <BookOpen className="w-12 h-12 opacity-20" />
                <p className="text-sm font-light italic">Waiting for inspiration...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Chat Sidebar */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-[#0f0f0f] border-l border-white/10 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="text-emerald-500 w-5 h-5" />
                  <h3 className="font-semibold">The Muse's Whisper</h3>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <Sparkles className="w-12 h-12" />
                    <p className="text-sm font-light">Ask about the world, the characters, or what happens next.</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`
                      max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed
                      ${msg.role === 'user' 
                        ? 'bg-emerald-500 text-black font-medium rounded-tr-none' 
                        : 'bg-white/5 text-white/90 rounded-tl-none border border-white/5'}
                    `}>
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </motion.div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/5">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="p-6 border-t border-white/5 bg-[#0a0a0a]">
                <div className="relative">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask the Muse..."
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/20"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isChatLoading}
                    className="absolute right-2 top-2 bottom-2 px-4 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 disabled:opacity-50 transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <audio 
        ref={audioRef} 
        onEnded={() => setIsNarrating(false)}
        className="hidden"
      />
    </div>
  );
}
