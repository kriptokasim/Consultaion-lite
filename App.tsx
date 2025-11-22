import React, { useState, useEffect, useRef } from 'react';
import { AGENTS } from './services/consultantData';
import { AVAILABLE_MODELS, DEFAULT_MODELS } from './services/modelData';
import { generateCompletion } from './utils/llm';
import { AgentRole, TranscriptEntry, VoteState, AppState, RoundSummary, ModelOption } from './types';

const MAX_ROUNDS = 5;
const MIN_ROUNDS = 3;

const SUGGESTED_TOPICS = [
  "Is AI consciousness possible?",
  "Universal Basic Income: Essential or risky?",
  "Should Mars colonization be a priority?",
  "Remote work vs Office culture"
];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- SVGs and Visual Components ---

const GavelIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
);

const ParliamentSeating = ({ proScore, className }: { proScore: number, className?: string }) => {
  const totalSeats = 60; // Number of dots in the arch
  const radius = 80;
  const centerX = 100;
  const centerY = 90;
  
  // Calculate how many seats belong to pro vs con
  const proSeatCount = Math.round((proScore / 100) * totalSeats);
  
  const seats = Array.from({ length: totalSeats }).map((_, i) => {
    // Calculate angle for arch (from 180 deg to 0 deg)
    const angle = Math.PI - (i / (totalSeats - 1)) * Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY - radius * Math.sin(angle);
    
    // Reverse index for coloring (Pro on left/start, Con on right/end)
    // Actually, standard parliament: Left is usually opposition, Right is gov. 
    // Let's stick to our colors: Pro (Amber) on Right, Con (Stone) on Left.
    const isPro = i < proSeatCount;
    
    return (
      <circle 
        key={i}
        cx={x} 
        cy={y} 
        r="2.5" 
        className={`transition-all duration-500 ${isPro ? 'fill-amber-500' : 'fill-stone-300'}`}
        stroke="rgba(0,0,0,0.1)"
        strokeWidth="0.5"
      />
    );
  });

  return (
    <svg viewBox="0 0 200 110" className={className}>
      {/* Floor texture lines */}
      <path d="M20 90 H180" stroke="#E7E5E4" strokeWidth="1" />
      <path d="M40 90 L100 40 L160 90" stroke="#E7E5E4" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
      
      {/* The Seats */}
      {seats}
      
      {/* Speaker's Podium */}
      <rect x="90" y="85" width="20" height="15" rx="2" className="fill-mocha-800" />
      <circle cx="100" cy="85" r="4" className="fill-amber-100" />
      
      {/* Text Overlay */}
      <text x="100" y="105" textAnchor="middle" className="text-[10px] font-bold fill-mocha-900 uppercase tracking-widest">
        The Chamber
      </text>
    </svg>
  );
};

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [appState, setAppState] = useState<AppState>('SETUP');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [voteState, setVoteState] = useState<VoteState>({ proScore: 50, conScore: 50, reasoning: 'Session has not commenced.' });
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [finalSummary, setFinalSummary] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAction, setCurrentAction] = useState('');
  const [roundNumber, setRoundNumber] = useState(0);
  const [activeRole, setActiveRole] = useState<AgentRole | null>(null);
  const [showGavel, setShowGavel] = useState(false);

  // Model Selection State
  const [selectedModels, setSelectedModels] = useState({
    [AgentRole.PRO]: DEFAULT_MODELS.PRO,
    [AgentRole.CON]: DEFAULT_MODELS.CON,
    [AgentRole.JUDGE]: DEFAULT_MODELS.JUDGE
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDebatingRef = useRef(false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [transcript, currentAction, activeRole]);

  const triggerGavel = async () => {
    setShowGavel(true);
    await wait(700); // Wait for animation
    setShowGavel(false);
  };

  const getModelName = (role: AgentRole) => {
    const id = role === AgentRole.MODERATOR ? DEFAULT_MODELS.MODERATOR : selectedModels[role as keyof typeof selectedModels];
    return AVAILABLE_MODELS.find(m => m.id === id)?.name || "AI Model";
  };

  const createEntry = (role: AgentRole, text: string): TranscriptEntry => ({
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    role,
    agentName: AGENTS[role].name,
    modelName: getModelName(role),
    text,
    timestamp: new Date()
  });

  const stopDebate = () => {
    isDebatingRef.current = false;
    setIsProcessing(false);
    setCurrentAction('');
    setActiveRole(null);
  };

  const resetDebate = () => {
    stopDebate();
    setAppState('SETUP');
    setTopic('');
    setRoundNumber(0);
    setRounds([]);
    setFinalSummary('');
  };

  const concludeDebate = async (finalHistory: TranscriptEntry[], reason: string) => {
    setIsProcessing(true);
    setActiveRole(AgentRole.MODERATOR);
    setCurrentAction("Concluding session...");
    
    await wait(1500);
    const closingEntry = createEntry(AgentRole.MODERATOR, reason);
    setTranscript(prev => [...prev, closingEntry]);
    setActiveRole(null);
    
    // Gavel strike on close
    await triggerGavel();

    try {
      setCurrentAction("Drafting official dossier...");
      const context = finalHistory.map(t => `${t.agentName} (${t.modelName}): ${t.text}`).join('\n');
      
      const summaryText = await generateCompletion({
        model: DEFAULT_MODELS.MODERATOR,
        systemInstruction: AGENTS[AgentRole.MODERATOR].systemInstruction,
        prompt: `Review this debate on "${topic}". Write a concise, 1-paragraph final verdict (max 100 words). Adopt a formal tone.\n\nTranscript:\n${context}`
      });

      setFinalSummary(summaryText || "The debate has concluded.");
    } catch (e) {
      setFinalSummary("The debate concluded.");
    }

    await wait(1500);
    stopDebate();
    setAppState('CONCLUDED');
  };

  const conductDebateRound = async (currentHistory: TranscriptEntry[], currentRound: number) => {
    if (!isDebatingRef.current) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setRoundNumber(currentRound);
    
    const context = currentHistory.map(t => `${t.agentName} (${t.modelName}): ${t.text}`).join('\n');
    let roundHistory = [...currentHistory];

    try {
      // --- PROPONENT TURN ---
      if (!isDebatingRef.current) return;
      
      setActiveRole(AgentRole.PRO);
      const proModel = selectedModels[AgentRole.PRO];
      const proName = getModelName(AgentRole.PRO);
      setCurrentAction(`${AGENTS[AgentRole.PRO].name} is presenting...`);
      
      const proStartTime = Date.now();
      
      const proText = await generateCompletion({
        model: proModel,
        systemInstruction: AGENTS[AgentRole.PRO].systemInstruction,
        prompt: `Topic: ${topic}. History: ${context}. Round ${currentRound}/${MAX_ROUNDS}. Argue IN FAVOR. Under 80 words. Be formal.`
      });
      
      const proElapsed = Date.now() - proStartTime;
      if (proElapsed < 1500) await wait(1500 - proElapsed);

      setActiveRole(null);
      const proEntry = createEntry(AgentRole.PRO, proText || "I rest my case.");
      setTranscript(prev => [...prev, proEntry]);
      roundHistory.push(proEntry);
      
      const proReadTime = Math.min(Math.max(1500, proEntry.text.length * 30), 4000);
      setCurrentAction("..."); 
      await wait(proReadTime);

      // --- OPPONENT TURN ---
      if (!isDebatingRef.current) return;
      
      setActiveRole(AgentRole.CON);
      const conModel = selectedModels[AgentRole.CON];
      const conName = getModelName(AgentRole.CON);
      setCurrentAction(`${AGENTS[AgentRole.CON].name} is rebutting...`);

      const conStartTime = Date.now();

      const conText = await generateCompletion({
        model: conModel,
        systemInstruction: AGENTS[AgentRole.CON].systemInstruction,
        prompt: `Topic: ${topic}. History: ${context}. Proponent said: "${proEntry.text}". Round ${currentRound}/${MAX_ROUNDS}. Argue AGAINST. Under 80 words. Be formal.`
      });

      const conElapsed = Date.now() - conStartTime;
      if (conElapsed < 1500) await wait(1500 - conElapsed);

      setActiveRole(null);
      const conEntry = createEntry(AgentRole.CON, conText || "No further objections.");
      setTranscript(prev => [...prev, conEntry]);
      roundHistory.push(conEntry);

      const conReadTime = Math.min(Math.max(1500, conEntry.text.length * 30), 4000);
      setCurrentAction("...");
      await wait(conReadTime);

      // --- JUDGE TURN ---
      if (!isDebatingRef.current) return;
      
      setActiveRole(AgentRole.JUDGE);
      const judgeModel = selectedModels[AgentRole.JUDGE];
      const judgeName = getModelName(AgentRole.JUDGE);
      setCurrentAction(`The Chamber is polling votes...`);
      
      await wait(2000);

      let result = { proScore: 50, reasoning: "Evaluating...", isConcluded: false };
      
      try {
        const judgeRaw = await generateCompletion({
          model: judgeModel,
          systemInstruction: AGENTS[AgentRole.JUDGE].systemInstruction,
          prompt: `Analyze round ${currentRound} on "${topic}". Pro: "${proEntry.text}". Con: "${conEntry.text}". Evaluate strength. Respond ONLY in JSON.`,
          jsonMode: true
        });
        
        const cleanJson = judgeRaw.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(cleanJson);
      } catch (e) {
        console.warn("Judge JSON parse failed, using default", e);
        result = { proScore: 50, reasoning: "Arguments noted in record.", isConcluded: false };
      }

      setActiveRole(null);
      setVoteState({
        proScore: result.proScore,
        conScore: 100 - result.proScore,
        reasoning: result.reasoning
      });
      setRounds(prev => [...prev, {
        roundNumber: currentRound,
        proText: proEntry.text,
        conText: conEntry.text,
        judgeResult: { proScore: result.proScore, reasoning: result.reasoning }
      }]);

      const isKnockout = result.proScore >= 85 || result.proScore <= 15;
      
      setCurrentAction("Recording votes...");
      await wait(2500);

      if (currentRound >= MIN_ROUNDS && (result.isConcluded || isKnockout)) {
        const reason = isKnockout ? "Motion carried by dominant majority." : "Consensus achieved in the chamber.";
        concludeDebate(roundHistory, reason);
        return;
      }

      setCurrentAction("Moving to next round...");
      await wait(1500);

      if (isDebatingRef.current) {
        if (currentRound < MAX_ROUNDS) {
          conductDebateRound(roundHistory, currentRound + 1);
        } else {
          concludeDebate(roundHistory, "Session time expired.");
        }
      }

    } catch (error) {
      console.error("Debate Error:", error);
      alert("Connection lost. Check API Key.");
      stopDebate();
    }
  };

  const startDebate = async (selectedTopic = topic) => {
    if (!selectedTopic.trim()) return;
    
    setAppState('DEBATING');
    setTranscript([]);
    setRounds([]);
    setFinalSummary('');
    setVoteState({ proScore: 50, conScore: 50, reasoning: "Session initialized." });
    isDebatingRef.current = true;
    setRoundNumber(0);

    setIsProcessing(true);
    setActiveRole(AgentRole.MODERATOR);
    setCurrentAction("Calling session to order...");
    
    try {
      await triggerGavel(); // Open session
      await wait(500);
      const introText = await generateCompletion({
        model: DEFAULT_MODELS.MODERATOR,
        systemInstruction: AGENTS[AgentRole.MODERATOR].systemInstruction,
        prompt: `Topic: ${selectedTopic}. Introduce briefly. Formal tone.`
      });
      
      const introEntry = createEntry(AgentRole.MODERATOR, introText || "Welcome to the debate.");
      setActiveRole(null);
      setTranscript([introEntry]);
      
      setCurrentAction("The floor is open...");
      await wait(2000);
      
      conductDebateRound([introEntry], 1);
    } catch (e) {
      console.error(e);
      alert("Failed to start. Check API Key.");
      stopDebate();
      setAppState('SETUP');
    }
  };

  const finalProScore = voteState.proScore;
  const winner = finalProScore > 55 ? "Proponent" : 
                 finalProScore < 45 ? "Skeptic" : "Draw";

  return (
    <div className="h-dvh w-full flex flex-col bg-marble overflow-hidden relative text-mocha-900">
      
      {/* Gavel Overlay */}
      {showGavel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-8 rounded-full shadow-2xl animate-gavel-strike origin-bottom-right">
             <img src="https://api.dicebear.com/9.x/icons/svg?seed=Gavel&backgroundColor=transparent" className="w-32 h-32" alt="Gavel" />
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex-none bg-white/80 backdrop-blur-md border-b border-stone-200 h-16 flex items-center justify-between px-6 z-20 shadow-parchment">
        <div className="flex items-center gap-3">
          <div className="bg-mocha-900 p-1.5 rounded-lg">
            <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/>
            </svg>
          </div>
          <div>
             <h1 className="text-xl font-display font-bold text-mocha-950 tracking-tight">Consultaion</h1>
             <div className="text-[10px] uppercase tracking-widest text-amber-700 font-bold leading-none">Chamber of Intelligence</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {(appState === 'DEBATING' || appState === 'CONCLUDED') && (
            <button onClick={resetDebate} className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-mocha-900 transition-colors flex items-center gap-2">
              <span className="w-4 h-4 border border-stone-400 rounded-full flex items-center justify-center">✕</span>
              End Session
            </button>
          )}
        </div>
      </header>

      {appState === 'SETUP' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in overflow-y-auto relative">
          {/* Decorative Background Elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
            <svg className="absolute -top-20 -left-20 w-96 h-96 text-amber-100/50" viewBox="0 0 200 200" fill="currentColor"><circle cx="100" cy="100" r="80" /></svg>
            <svg className="absolute top-1/2 right-0 w-64 h-64 text-stone-100" viewBox="0 0 200 200" fill="currentColor"><rect x="50" y="50" width="100" height="100" transform="rotate(45 100 100)" /></svg>
          </div>

          <div className="w-full max-w-4xl text-center space-y-10 relative z-10">
             <div className="space-y-4">
               <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold uppercase tracking-widest">
                 Official Multi-Agent Protocol
               </div>
               <h1 className="text-5xl md:text-7xl font-display font-bold text-mocha-950 tracking-tighter drop-shadow-sm">
                The <span className="text-amber-600">Chamber</span>
               </h1>
               <p className="text-lg text-mocha-800/70 max-w-xl mx-auto font-serif italic">
                 "Where artificial intelligences convene to debate the matters of the day."
               </p>
             </div>
             
             <div className="grid md:grid-cols-3 gap-6 text-left max-w-3xl mx-auto">
                {[AgentRole.PRO, AgentRole.CON, AgentRole.JUDGE].map((role) => (
                  <div key={role} className="bg-white p-5 rounded-xl shadow-parchment border border-stone-200 relative overflow-hidden group transition-all hover:-translate-y-1">
                    <div className={`absolute top-0 left-0 w-1 h-full ${role === AgentRole.PRO ? 'bg-amber-500' : role === AgentRole.CON ? 'bg-stone-500' : 'bg-mocha-800'}`}></div>
                    <div className="flex items-center gap-3 mb-3">
                       <img src={AGENTS[role].avatarUrl} className="w-10 h-10 rounded-lg bg-stone-100 object-cover" />
                       <div>
                         <div className="text-xs font-bold uppercase tracking-wider text-stone-400">{AGENTS[role].title}</div>
                         <div className="font-display font-bold text-mocha-900">{AGENTS[role].name}</div>
                       </div>
                    </div>
                    <select 
                      className="w-full text-xs font-medium text-mocha-900 bg-stone-50 border border-stone-200 rounded-lg p-2 focus:ring-1 focus:ring-amber-400 outline-none cursor-pointer hover:bg-white transition-colors"
                      value={selectedModels[role as keyof typeof selectedModels]}
                      onChange={(e) => setSelectedModels({...selectedModels, [role]: e.target.value})}
                    >
                      {AVAILABLE_MODELS.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.isFree ? '(Free)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
             </div>

             <div className="relative max-w-xl mx-auto w-full group">
               <div className="absolute -inset-1 bg-gradient-to-r from-amber-200 to-stone-200 rounded-full blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
               <div className="relative flex items-center bg-white rounded-full shadow-lg border border-stone-200 overflow-hidden">
                 <input
                   type="text"
                   value={topic}
                   onChange={(e) => setTopic(e.target.value)}
                   placeholder="Propose a motion for debate..."
                   className="w-full px-8 py-5 text-lg bg-transparent outline-none placeholder-stone-400 font-serif text-mocha-900"
                   onKeyDown={(e) => e.key === 'Enter' && startDebate()}
                 />
                 <button
                   onClick={() => startDebate()}
                   disabled={!topic.trim() || isProcessing}
                   className="mr-2 px-8 py-3 bg-mocha-900 hover:bg-mocha-800 text-amber-50 font-bold rounded-full transition-all disabled:opacity-50 flex items-center gap-2"
                 >
                   <span>Gavel</span>
                   <GavelIcon className="w-4 h-4" />
                 </button>
               </div>
             </div>

             <div className="pt-2 animate-slide-up" style={{animationDelay: '0.1s'}}>
                <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4">Pending Motions</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {SUGGESTED_TOPICS.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => { setTopic(t); startDebate(t); }}
                      className="px-4 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-600 hover:border-amber-400 hover:text-amber-700 transition-all shadow-sm"
                    >
                      {t}
                    </button>
                  ))}
                </div>
             </div>
          </div>
        </main>
      )}

      {appState === 'DEBATING' && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* Sidebar / Chamber Visualization */}
          <aside className="lg:w-80 bg-stone-50 border-b lg:border-b-0 lg:border-r border-stone-200 flex flex-col shrink-0 z-10 lg:h-full relative shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
             {/* Mobile Compact View */}
             <div className="lg:hidden px-4 py-3 flex items-center justify-between bg-white border-b border-stone-200">
                <div className="flex items-center gap-3">
                   <ParliamentSeating proScore={voteState.proScore} className="w-24 h-12" />
                   <div className="flex flex-col">
                     <span className="text-[10px] uppercase font-bold text-stone-400">Current Vote</span>
                     <span className="text-lg font-display font-bold text-mocha-900">{voteState.proScore}% Pro</span>
                   </div>
                </div>
             </div>

             {/* Desktop Expanded View */}
             <div className="hidden lg:flex flex-col h-full p-6 bg-parchment">
                <div className="flex-1 flex flex-col gap-8">
                   {/* The Chamber Visualization */}
                   <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-stone-400"></div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-4">Parliament Seating</h3>
                      <ParliamentSeating proScore={voteState.proScore} className="w-full drop-shadow-sm" />
                      <div className="flex justify-between mt-4 px-2">
                         <div className="text-left">
                            <div className="text-[10px] font-bold uppercase text-amber-600">Affirmative</div>
                            <div className="text-2xl font-display font-bold text-mocha-900">{voteState.proScore}</div>
                         </div>
                         <div className="text-right">
                            <div className="text-[10px] font-bold uppercase text-stone-500">Opposition</div>
                            <div className="text-2xl font-display font-bold text-mocha-900">{100 - voteState.proScore}</div>
                         </div>
                      </div>
                   </div>

                   {/* The Judge's Card */}
                   <div className={`p-6 bg-white rounded-xl border border-stone-200 shadow-sm transition-all duration-500 relative ${activeRole === AgentRole.JUDGE ? 'ring-1 ring-amber-400 shadow-md' : ''}`}>
                      <div className="absolute -top-3 left-4 bg-mocha-900 text-amber-50 text-[10px] font-bold px-2 py-1 uppercase tracking-widest rounded-sm shadow-sm">
                        Official Record
                      </div>
                      <div className="mt-2">
                         <div className="flex items-center gap-2 mb-3">
                            <img src={AGENTS[AgentRole.JUDGE].avatarUrl} className="w-8 h-8 rounded bg-stone-100" />
                            <span className="text-xs font-bold text-mocha-900">{getModelName(AgentRole.JUDGE)}</span>
                         </div>
                         <p className="text-sm font-serif text-mocha-800 italic leading-relaxed pl-3 border-l-2 border-amber-200">
                           "{voteState.reasoning}"
                         </p>
                      </div>
                   </div>

                   {/* Round Indicator */}
                   <div className="flex items-center justify-center gap-4 py-4 border-t border-stone-200 border-b">
                      <div className="text-center">
                         <div className="text-[10px] font-bold uppercase text-stone-400">Session</div>
                         <div className="font-display font-bold text-xl text-mocha-900">#{Math.floor(Math.random() * 1000) + 2025}</div>
                      </div>
                      <div className="h-8 w-px bg-stone-200"></div>
                      <div className="text-center">
                         <div className="text-[10px] font-bold uppercase text-stone-400">Round</div>
                         <div className="font-display font-bold text-xl text-mocha-900">{roundNumber}/{MAX_ROUNDS}</div>
                      </div>
                   </div>
                </div>
             </div>
          </aside>

          {/* Main Chat Area */}
          <main className="flex-1 flex flex-col h-full relative bg-marble">
             {/* Topic Banner */}
             <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-[#FDFBF7] via-[#FDFBF7]/90 to-transparent px-6 pt-6 pb-12 pointer-events-none">
                <div className="max-w-3xl mx-auto text-center">
                  <div className="inline-block border-b-2 border-amber-500/30 pb-2 mb-2">
                    <h2 className="font-display font-bold text-mocha-950 text-lg md:text-xl drop-shadow-sm pointer-events-auto leading-tight">{topic}</h2>
                  </div>
                </div>
             </div>

             {/* Messages List */}
             <div 
               ref={scrollRef}
               className="flex-1 overflow-y-auto px-4 md:px-12 pt-32 pb-32 space-y-8 no-scrollbar scroll-smooth"
             >
               {transcript.map((entry) => {
                  const isPro = entry.role === AgentRole.PRO;
                  const isMod = entry.role === AgentRole.MODERATOR;

                  if (isMod) {
                    return (
                      <div key={entry.id} className="flex justify-center py-4 animate-slide-up">
                        <div className="relative bg-white border border-stone-200 px-8 py-4 shadow-parchment max-w-2xl text-center transform rotate-1">
                           <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-stone-200 rounded-full opacity-50"></div>
                           <div className="font-display text-xs font-bold text-mocha-900 mb-2 uppercase tracking-widest border-b border-stone-100 pb-1 inline-block">Speaker of the House</div>
                           <p className="text-sm font-serif text-mocha-800 leading-relaxed">"{entry.text}"</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={entry.id} className={`flex gap-4 md:gap-6 ${isPro ? 'flex-row' : 'flex-row-reverse'} animate-message-pop group`}>
                       <div className="flex flex-col items-center gap-2 shrink-0">
                          <div className="relative">
                            <img 
                              src={AGENTS[entry.role].avatarUrl} 
                              className={`w-12 h-12 md:w-14 md:h-14 rounded bg-stone-100 object-cover shadow-md border border-stone-200`}
                              alt={entry.agentName}
                            />
                            {/* Role Badge */}
                            <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shadow-sm whitespace-nowrap ${isPro ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-200 text-stone-700 border-stone-300'}`}>
                              {isPro ? 'Pro' : 'Con'}
                            </div>
                          </div>
                       </div>
                       
                       <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${isPro ? 'items-start' : 'items-end'}`}>
                          <div className={`relative p-6 md:p-7 shadow-parchment text-sm md:text-base leading-relaxed border transition-all hover:shadow-md bg-white
                             ${isPro 
                               ? 'rounded-tr-xl rounded-br-xl rounded-bl-xl border-l-4 border-l-amber-500 border-y-stone-200 border-r-stone-200' 
                               : 'rounded-tl-xl rounded-bl-xl rounded-br-xl border-r-4 border-r-stone-500 border-y-stone-200 border-l-stone-200'
                             }`}>
                             
                             {/* Header inside the paper */}
                             <div className={`flex items-center gap-2 mb-3 pb-2 border-b border-stone-100 ${isPro ? '' : 'flex-row-reverse'}`}>
                               <span className="font-display font-bold text-mocha-950 text-sm">
                                 {AGENTS[entry.role].name}
                               </span>
                               <span className="text-[10px] text-stone-400 font-mono uppercase">
                                 {entry.modelName}
                               </span>
                             </div>

                             <p className="hansard-text text-mocha-900 prose-dropcap">{entry.text}</p>
                          </div>
                       </div>
                    </div>
                  );
               })}

               {/* Active Speaker Podium Indicator */}
               {activeRole && activeRole !== AgentRole.JUDGE && (
                 <div className={`flex gap-4 animate-fade-in ${activeRole === AgentRole.PRO ? 'flex-row' : activeRole === AgentRole.CON ? 'flex-row-reverse' : 'justify-center'}`}>
                    {activeRole !== AgentRole.MODERATOR && (
                      <div className="w-14 h-14 flex items-center justify-center">
                         <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
                      </div>
                    )}
                    <div className="bg-mocha-900 text-amber-50 px-6 py-3 rounded-full flex items-center gap-3 shadow-podium">
                       <div className="flex space-x-1">
                          <div className="w-1 h-4 bg-amber-500 animate-[height_1s_ease-in-out_infinite]"></div>
                          <div className="w-1 h-4 bg-amber-500 animate-[height_1s_ease-in-out_0.2s_infinite]"></div>
                          <div className="w-1 h-4 bg-amber-500 animate-[height_1s_ease-in-out_0.4s_infinite]"></div>
                       </div>
                       <span className="text-xs font-bold uppercase tracking-widest">{getModelName(activeRole)} Speaking</span>
                    </div>
                 </div>
               )}
               
               <div className="h-16"></div>
             </div>

             {/* Bottom Controls */}
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-20 w-full pointer-events-none">
               {currentAction && isProcessing && (
                 <div className="bg-white/90 backdrop-blur px-4 py-1 rounded-full border border-stone-200 shadow-sm text-[10px] font-bold uppercase tracking-widest text-mocha-800 animate-pulse mb-2">
                   {currentAction}
                 </div>
               )}
               
               <div className="pointer-events-auto">
                 {isProcessing ? (
                   <button 
                     onClick={stopDebate}
                     className="bg-white border border-stone-300 shadow-lg px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition-all active:scale-95 flex items-center gap-2 group"
                   >
                     <span className="w-2 h-2 bg-red-500 rounded-full group-hover:animate-pulse"></span>
                     Recess
                   </button>
                 ) : (
                   <button 
                     onClick={() => conductDebateRound(transcript, roundNumber)}
                     className="bg-mocha-900 shadow-xl px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest text-amber-50 hover:bg-mocha-800 transition-all active:scale-95 flex items-center gap-2"
                   >
                     <GavelIcon className="w-4 h-4" />
                     Resume Session
                   </button>
                 )}
               </div>
             </div>
          </main>
        </div>
      )}

      {appState === 'CONCLUDED' && (
        <main className="flex-1 overflow-y-auto p-4 md:p-12 animate-fade-in bg-marble">
           <div className="max-w-4xl mx-auto bg-white rounded-none shadow-2xl overflow-hidden border-t-8 border-mocha-900 relative">
              {/* Official Seal Watermark */}
              <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                <svg width="200" height="200" viewBox="0 0 200 200" fill="currentColor" className="text-mocha-900">
                  <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="4" fill="none" />
                  <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M100 20 L100 180 M20 100 L180 100" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>

              {/* Conclusion Header */}
              <div className="p-12 text-center border-b border-stone-200">
                 <div className="inline-block border-b border-amber-500 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-mocha-900">Official Dossier</span>
                 </div>
                 <h1 className="text-4xl md:text-5xl font-display font-bold text-mocha-950 mb-8">{topic}</h1>
                 
                 <div className="flex justify-center gap-8">
                    <div className="text-center">
                       <div className="text-4xl font-display font-bold text-amber-600">{finalProScore}%</div>
                       <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mt-1">Affirmative</div>
                    </div>
                    <div className="w-px bg-stone-200 h-12"></div>
                    <div className="text-center">
                       <div className="text-4xl font-display font-bold text-stone-600">{100 - finalProScore}</div>
                       <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mt-1">Opposition</div>
                    </div>
                 </div>
                 
                 <div className="mt-8 inline-block px-6 py-2 bg-stone-100 rounded text-sm font-serif font-bold text-mocha-900">
                    Verdict: {winner}
                 </div>
              </div>
              
              {/* Summary & Rounds */}
              <div className="p-8 md:p-16 space-y-12">
                 {finalSummary && (
                   <div className="prose prose-amber mx-auto text-center max-w-2xl">
                      <p className="text-lg font-serif text-mocha-900 leading-loose italic">"{finalSummary}"</p>
                      <div className="mt-4 flex justify-center">
                        <img src="https://api.dicebear.com/9.x/icons/svg?seed=Pen&backgroundColor=transparent" className="w-8 h-8 opacity-30" />
                      </div>
                   </div>
                 )}

                 <div className="space-y-8 relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-stone-200 hidden md:block"></div>

                    {rounds.map((round, i) => (
                       <div key={i} className="relative">
                          <div className="flex justify-center mb-6 md:mb-0 md:absolute md:left-1/2 md:-translate-x-1/2 md:top-0 z-10">
                             <div className="bg-white border border-stone-200 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-stone-400 shadow-sm">
                               Round {round.roundNumber}
                             </div>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-8 md:gap-16">
                             <div className="bg-white p-6 shadow-parchment border-l-2 border-amber-400">
                                <div className="text-[10px] font-bold uppercase text-amber-600 mb-2 flex justify-between">
                                  <span>Proponent</span>
                                  <span className="opacity-50">{getModelName(AgentRole.PRO)}</span>
                                </div>
                                <p className="text-sm font-serif text-mocha-900/80 leading-relaxed">{round.proText}</p>
                             </div>
                             <div className="bg-white p-6 shadow-parchment border-r-2 border-stone-400 text-right md:text-left">
                                <div className="text-[10px] font-bold uppercase text-stone-500 mb-2 flex justify-between flex-row-reverse md:flex-row">
                                  <span>Skeptic</span>
                                  <span className="opacity-50">{getModelName(AgentRole.CON)}</span>
                                </div>
                                <p className="text-sm font-serif text-mocha-900/80 leading-relaxed">{round.conText}</p>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
                 
                 <div className="flex justify-center pt-12 border-t border-stone-200">
                    <button onClick={() => window.print()} className="bg-mocha-900 text-white px-6 py-3 rounded text-sm font-bold uppercase tracking-widest hover:bg-mocha-800 transition-colors">
                       Print Official Record
                    </button>
                 </div>
              </div>
           </div>
        </main>
      )}
    </div>
  );
};

export default App;