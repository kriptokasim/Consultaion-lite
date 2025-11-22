import React, { useState, useEffect, useRef } from 'react';
import { AGENTS } from './services/consultantData';
import { AVAILABLE_MODELS, DEFAULT_MODELS } from './services/modelData';
import { generateCompletion } from './utils/llm';
import { AgentRole, TranscriptEntry, VoteState, AppState, RoundSummary, ModelOption, SavedDebate } from './types';

const MAX_ROUNDS = 5;
const MIN_ROUNDS = 3;

const SUGGESTED_TOPICS = [
  "Is AI consciousness possible?",
  "Universal Basic Income: Essential or risky?",
  "Should Mars colonization be a priority?",
  "Remote work vs Office culture"
];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Visual Components ---

const GavelIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
  </svg>
);

const HistoryIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

const ParliamentSeating = ({ proScore, className }: { proScore: number, className?: string }) => {
  const totalSeats = 60;
  const radius = 80;
  const centerX = 100;
  const centerY = 90;
  
  const proSeatCount = Math.round((proScore / 100) * totalSeats);
  
  const seats = Array.from({ length: totalSeats }).map((_, i) => {
    const angle = Math.PI - (i / (totalSeats - 1)) * Math.PI;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY - radius * Math.sin(angle);
    
    const isPro = i < proSeatCount;
    
    return (
      <circle 
        key={i}
        cx={x} 
        cy={y} 
        r={isPro && i === proSeatCount - 1 ? "3.5" : "2.5"} // Highlight the tipping point
        className={`transition-all duration-500 ${isPro ? 'fill-amber-500 drop-shadow-[0_0_2px_rgba(245,158,11,0.6)]' : 'fill-stone-300'}`}
        stroke="rgba(0,0,0,0.1)"
        strokeWidth="0.5"
      />
    );
  });

  return (
    <svg viewBox="0 0 200 110" className={className}>
      <path d="M20 90 H180" stroke="#E7E5E4" strokeWidth="1" />
      <path d="M40 90 L100 40 L160 90" stroke="#E7E5E4" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
      {seats}
      <rect x="90" y="85" width="20" height="15" rx="2" className="fill-mocha-800" />
      <circle cx="100" cy="85" r="4" className="fill-amber-100" />
      <text x="100" y="105" textAnchor="middle" className="text-[10px] font-bold fill-mocha-900 uppercase tracking-widest">The Chamber</text>
    </svg>
  );
};

const VerdictStamp = ({ isPassed }: { isPassed: boolean }) => (
  <div className={`absolute top-10 right-10 z-20 animate-stamp-drop border-4 border-double p-4 rounded-lg transform -rotate-12 mix-blend-multiply opacity-90 ${isPassed ? 'text-ink-green border-ink-green' : 'text-ink-red border-ink-red'}`}>
    <div className="text-4xl font-display font-black uppercase tracking-widest stamp-ink whitespace-nowrap">
      {isPassed ? 'MOTION CARRIED' : 'MOTION DENIED'}
    </div>
    <div className="text-[10px] font-bold uppercase text-center mt-1 tracking-[0.2em]">
      Official Verdict
    </div>
  </div>
);

const NewsTicker = ({ text }: { text: string }) => (
  <div className="w-full bg-mocha-900 text-amber-50 overflow-hidden py-2 flex items-center border-t-2 border-amber-600 shadow-lg relative z-30">
    <div className="bg-amber-600 text-mocha-900 text-[10px] font-black uppercase px-3 py-1 ml-4 rounded-sm shrink-0 tracking-widest mr-4 animate-pulse">
      Live
    </div>
    <div className="flex-1 overflow-hidden relative h-6">
      <div className="absolute whitespace-nowrap font-mono text-sm uppercase tracking-wider animate-slide-up top-0.5">
        {text} <span className="mx-4 text-amber-500/50">///</span> {new Date().toLocaleTimeString()}
      </div>
    </div>
  </div>
);

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
  const [history, setHistory] = useState<SavedDebate[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [selectedModels, setSelectedModels] = useState({
    [AgentRole.PRO]: DEFAULT_MODELS.PRO,
    [AgentRole.CON]: DEFAULT_MODELS.CON,
    [AgentRole.JUDGE]: DEFAULT_MODELS.JUDGE
  });
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDebatingRef = useRef(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('debate_history');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [transcript, currentAction, activeRole]);

  const triggerGavel = async () => {
    setShowGavel(true);
    await wait(700);
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

  const saveDebateToHistory = (
    fullTranscript: TranscriptEntry[], 
    finalVoteState: VoteState,
    summary: string,
    debateTopic: string,
    debateRounds: RoundSummary[]
  ) => {
    const isMotionPassed = finalVoteState.proScore > 50;
    const newDebate: SavedDebate = {
      id: Date.now().toString(),
      topic: debateTopic,
      date: Date.now(),
      transcript: fullTranscript,
      rounds: debateRounds,
      voteState: finalVoteState,
      finalSummary: summary,
      winner: isMotionPassed ? "Motion Carried" : "Motion Denied"
    };

    const updatedHistory = [newDebate, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('debate_history', JSON.stringify(updatedHistory));
  };

  const deleteDebate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedHistory = history.filter(h => h.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem('debate_history', JSON.stringify(updatedHistory));
  };

  const loadDebate = (debate: SavedDebate) => {
    setTopic(debate.topic);
    setTranscript(debate.transcript);
    setRounds(debate.rounds);
    setVoteState(debate.voteState);
    setFinalSummary(debate.finalSummary);
    setAppState('CONCLUDED');
    setShowHistoryModal(false);
  };

  const concludeDebate = async (finalHistory: TranscriptEntry[], reason: string) => {
    setIsProcessing(true);
    setActiveRole(AgentRole.MODERATOR);
    setCurrentAction("Moderator is concluding the session...");
    
    await wait(1500);
    const closingEntry = createEntry(AgentRole.MODERATOR, reason);
    const completeHistory = [...finalHistory, closingEntry];
    
    setTranscript(completeHistory);
    setActiveRole(null);
    
    await triggerGavel();

    let generatedSummary = "The debate concluded.";

    try {
      setCurrentAction("Drafting official dossier...");
      const context = finalHistory.map(t => `${t.agentName} (${t.modelName}): ${t.text}`).join('\n');
      
      const summaryText = await generateCompletion({
        model: DEFAULT_MODELS.MODERATOR,
        systemInstruction: AGENTS[AgentRole.MODERATOR].systemInstruction,
        prompt: `Review this debate on "${topic}". Write a concise, 1-paragraph final verdict (max 100 words). Adopt a formal tone.\n\nTranscript:\n${context}`
      });

      generatedSummary = summaryText || "The debate has concluded.";
      setFinalSummary(generatedSummary);
    } catch (e) {
      setFinalSummary("The debate concluded.");
    }

    // Save to history
    saveDebateToHistory(completeHistory, voteState, generatedSummary, topic, rounds);

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
      if (!isDebatingRef.current) return;
      
      setActiveRole(AgentRole.PRO);
      const proName = AGENTS[AgentRole.PRO].name;
      setCurrentAction(`${proName} has the floor...`);
      
      const proStartTime = Date.now();
      const proModel = selectedModels[AgentRole.PRO];
      
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
      
      const proReadTime = Math.min(Math.max(2000, proEntry.text.length * 30), 5000);
      setCurrentAction("Reading time..."); 
      await wait(proReadTime);

      if (!isDebatingRef.current) return;
      
      setActiveRole(AgentRole.CON);
      const conName = AGENTS[AgentRole.CON].name;
      setCurrentAction(`${conName} is offering rebuttal...`);

      const conStartTime = Date.now();
      const conModel = selectedModels[AgentRole.CON];

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

      const conReadTime = Math.min(Math.max(2000, conEntry.text.length * 30), 5000);
      setCurrentAction("Reading time...");
      await wait(conReadTime);

      if (!isDebatingRef.current) return;
      
      setActiveRole(AgentRole.JUDGE);
      setCurrentAction(`Chamber is tabulating votes...`);
      
      await wait(2000);

      let result = { proScore: 50, reasoning: "Evaluating...", isConcluded: false };
      
      try {
        const judgeModel = selectedModels[AgentRole.JUDGE];
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
      
      setCurrentAction("Recording votes in the ledger...");
      await wait(2500);

      if (currentRound >= MIN_ROUNDS && (result.isConcluded || isKnockout)) {
        const reason = isKnockout ? "Motion carried by dominant majority." : "Consensus achieved in the chamber.";
        concludeDebate(roundHistory, reason);
        return;
      }

      if (isDebatingRef.current) {
        if (currentRound < MAX_ROUNDS) {
          setCurrentAction("Moving to next round...");
          await wait(1500);
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
    setCurrentAction("Speaker calling session to order...");
    
    try {
      await triggerGavel();
      await wait(500);
      const introText = await generateCompletion({
        model: DEFAULT_MODELS.MODERATOR,
        systemInstruction: AGENTS[AgentRole.MODERATOR].systemInstruction,
        prompt: `Topic: ${selectedTopic}. Introduce briefly. Formal tone.`
      });
      
      const introEntry = createEntry(AgentRole.MODERATOR, introText || "Welcome to the debate.");
      setActiveRole(null);
      setTranscript([introEntry]);
      
      setCurrentAction("Opening floor for arguments...");
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
  const isMotionPassed = finalProScore > 50;

  return (
    <div className="h-dvh w-full flex flex-col bg-marble overflow-hidden relative text-mocha-900">
      
      {/* History Modal */}
      {showHistoryModal && (
        <div className="absolute inset-0 z-[100] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
           <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-stone-200">
             <div className="p-6 border-b border-stone-200 bg-stone-50 flex justify-between items-center">
                <div>
                  <h2 className="font-display font-bold text-xl text-mocha-900">Session Archives</h2>
                  <p className="text-xs text-stone-500 uppercase tracking-wider font-bold">Official Records</p>
                </div>
                <button onClick={() => setShowHistoryModal(false)} className="w-8 h-8 rounded-full hover:bg-stone-200 flex items-center justify-center transition-colors text-stone-500">
                  ✕
                </button>
             </div>
             <div className="flex-1 overflow-y-auto p-2 bg-parchment">
                {history.length === 0 ? (
                  <div className="text-center py-12 text-stone-400">
                    <p className="font-serif italic">No records found in the archives.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((item) => (
                      <div key={item.id} 
                           onClick={() => loadDebate(item)}
                           className="p-4 rounded-lg border border-stone-200 bg-white hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group flex justify-between items-center">
                         <div>
                           <div className="font-bold text-mocha-900 group-hover:text-amber-700 transition-colors">{item.topic}</div>
                           <div className="text-xs text-stone-500 mt-1 flex gap-3">
                             <span>{new Date(item.date).toLocaleDateString()}</span>
                             <span className={`font-bold ${item.winner === 'Motion Carried' ? 'text-green-700' : 'text-red-700'}`}>{item.winner}</span>
                             <span>{item.rounds.length} Rounds</span>
                           </div>
                         </div>
                         <button 
                           onClick={(e) => deleteDebate(item.id, e)}
                           className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                           title="Delete Record"
                         >
                           <TrashIcon className="w-4 h-4" />
                         </button>
                      </div>
                    ))}
                  </div>
                )}
             </div>
           </div>
        </div>
      )}

      {showGavel && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-white p-8 rounded-full shadow-2xl animate-gavel-strike origin-bottom-right">
             <img src="https://api.dicebear.com/9.x/icons/svg?seed=Gavel&backgroundColor=transparent" className="w-32 h-32" alt="Gavel" />
          </div>
        </div>
      )}

      <header className="flex-none bg-white/90 backdrop-blur-md border-b border-stone-200 h-16 flex items-center justify-between px-6 z-20 shadow-parchment">
        <div className="flex items-center gap-3 cursor-pointer" onClick={resetDebate}>
          <div className="bg-mocha-900 p-1.5 rounded-lg shadow-sm">
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
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-mocha-900 transition-colors flex items-center gap-2 px-3 py-1.5 hover:bg-stone-100 rounded"
          >
            <HistoryIcon className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>
          {(appState === 'DEBATING' || appState === 'CONCLUDED') && (
            <button onClick={resetDebate} className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-mocha-900 transition-colors flex items-center gap-2 px-3 py-1.5 hover:bg-stone-100 rounded">
              <span className="w-4 h-4 border border-stone-400 rounded-full flex items-center justify-center text-[10px]">✕</span>
              End Session
            </button>
          )}
        </div>
      </header>

      {appState === 'SETUP' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in overflow-y-auto relative">
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
            <svg className="absolute -top-20 -left-20 w-96 h-96 text-amber-100/50" viewBox="0 0 200 200" fill="currentColor"><circle cx="100" cy="100" r="80" /></svg>
            <svg className="absolute top-1/2 right-0 w-64 h-64 text-stone-100" viewBox="0 0 200 200" fill="currentColor"><rect x="50" y="50" width="100" height="100" transform="rotate(45 100 100)" /></svg>
          </div>

          <div className="w-full max-w-4xl text-center space-y-10 relative z-10 my-auto">
             <div className="space-y-4">
               <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-widest shadow-sm">
                 Official Multi-Agent Protocol v2.0
               </div>
               <h1 className="text-5xl md:text-7xl font-display font-bold text-mocha-950 tracking-tighter drop-shadow-sm">
                The <span className="text-amber-600 relative inline-block">
                  Chamber
                  <svg className="absolute -bottom-2 left-0 w-full h-2 text-amber-300/50" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="4" fill="none"/></svg>
                </span>
               </h1>
               <p className="text-lg text-mocha-800/70 max-w-xl mx-auto font-serif italic">
                 "Where artificial intelligences convene to debate the matters of the day."
               </p>
             </div>
             
             <div className="grid md:grid-cols-3 gap-6 text-left max-w-4xl mx-auto">
                {[AgentRole.PRO, AgentRole.CON, AgentRole.JUDGE].map((role) => (
                  <div key={role} className="bg-white p-1 rounded-xl shadow-parchment border border-stone-200 relative group transition-all hover:-translate-y-1 hover:shadow-lg">
                    <div className="bg-stone-50 p-4 rounded-lg h-full flex flex-col">
                       <div className="flex items-center gap-3 mb-4">
                          <div className="relative">
                             <img src={AGENTS[role].avatarUrl} className="w-12 h-12 rounded-lg bg-white border border-stone-200 object-cover shadow-sm" />
                             <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${role === AgentRole.PRO ? 'bg-amber-500' : role === AgentRole.CON ? 'bg-stone-500' : 'bg-mocha-800'}`}></div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{AGENTS[role].title}</div>
                            <div className="font-display font-bold text-mocha-900 text-lg leading-none">{AGENTS[role].name}</div>
                          </div>
                       </div>
                       
                       <div className="mt-auto">
                         <label className="text-[10px] font-bold uppercase text-stone-400 mb-1 block">Intelligence Model</label>
                         <div className="relative">
                           <select 
                             className="w-full text-xs font-medium text-mocha-900 bg-white border border-stone-200 rounded-lg p-2 pr-8 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none cursor-pointer appearance-none shadow-sm"
                             value={selectedModels[role as keyof typeof selectedModels]}
                             onChange={(e) => setSelectedModels({...selectedModels, [role]: e.target.value})}
                           >
                             {AVAILABLE_MODELS.map(m => (
                               <option key={m.id} value={m.id}>
                                 {m.name} {m.isFree ? '(Free)' : ''}
                               </option>
                             ))}
                           </select>
                           <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                             <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0L5 6L10 0H0Z"/></svg>
                           </div>
                         </div>
                       </div>
                    </div>
                  </div>
                ))}
             </div>

             <div className="relative max-w-xl mx-auto w-full group pt-4">
               <div className="absolute -inset-1 bg-gradient-to-r from-amber-200 to-stone-200 rounded-full blur opacity-30 group-hover:opacity-50 transition-opacity"></div>
               <div className="relative flex items-center bg-white rounded-full shadow-lg border border-stone-200 overflow-hidden p-1">
                 <input
                   type="text"
                   value={topic}
                   onChange={(e) => setTopic(e.target.value)}
                   placeholder="Propose a motion for debate..."
                   className="w-full px-6 py-4 text-lg bg-transparent outline-none placeholder-stone-400 font-serif text-mocha-900"
                   onKeyDown={(e) => e.key === 'Enter' && startDebate()}
                 />
                 <button
                   onClick={() => startDebate()}
                   disabled={!topic.trim() || isProcessing}
                   className="px-8 py-3 bg-mocha-900 hover:bg-mocha-800 text-amber-50 font-bold rounded-full transition-all disabled:opacity-50 flex items-center gap-2 shadow-md shrink-0"
                 >
                   <span>Commence</span>
                   <GavelIcon className="w-4 h-4" />
                 </button>
               </div>
             </div>

             <div className="pt-4 animate-slide-up opacity-0" style={{animationDelay: '0.2s', animationFillMode: 'forwards'}}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Recent Motions</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_TOPICS.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => { setTopic(t); startDebate(t); }}
                      className="px-3 py-1.5 bg-white border border-stone-200 rounded-md text-xs font-medium text-stone-600 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50 transition-all shadow-sm"
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
          <aside className="lg:w-80 bg-stone-50 border-b lg:border-b-0 lg:border-r border-stone-200 flex flex-col shrink-0 z-10 lg:h-full relative shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
             <div className="lg:hidden px-4 py-3 flex items-center justify-between bg-white border-b border-stone-200">
                <div className="flex items-center gap-3">
                   <ParliamentSeating proScore={voteState.proScore} className="w-24 h-12" />
                   <div className="flex flex-col">
                     <span className="text-[10px] uppercase font-bold text-stone-400">Live Vote</span>
                     <span className="text-lg font-display font-bold text-mocha-900">{voteState.proScore}% Pro</span>
                   </div>
                </div>
             </div>

             <div className="hidden lg:flex flex-col h-full p-6 bg-parchment">
                <div className="flex-1 flex flex-col gap-8">
                   <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm text-center relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-stone-400"></div>
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-4">Chamber Seating</h3>
                      <ParliamentSeating proScore={voteState.proScore} className="w-full drop-shadow-sm transition-transform group-hover:scale-105 duration-700" />
                      <div className="flex justify-between mt-4 px-2 border-t border-stone-100 pt-4">
                         <div className="text-left">
                            <div className="text-[10px] font-bold uppercase text-amber-600">Affirmative</div>
                            <div className="text-3xl font-display font-bold text-mocha-900">{voteState.proScore}</div>
                         </div>
                         <div className="w-px bg-stone-200 h-8 self-center"></div>
                         <div className="text-right">
                            <div className="text-[10px] font-bold uppercase text-stone-500">Opposition</div>
                            <div className="text-3xl font-display font-bold text-mocha-900">{100 - voteState.proScore}</div>
                         </div>
                      </div>
                   </div>

                   <div className={`p-6 bg-white rounded-xl border border-stone-200 shadow-sm transition-all duration-500 relative ${activeRole === AgentRole.JUDGE ? 'ring-2 ring-amber-400 shadow-md scale-[1.02]' : ''}`}>
                      <div className="absolute -top-2.5 left-4 bg-mocha-900 text-amber-50 text-[10px] font-bold px-2 py-0.5 uppercase tracking-widest rounded-sm shadow-sm">
                        Official Record
                      </div>
                      <div className="mt-2">
                         <div className="flex items-center gap-2 mb-3">
                            <img src={AGENTS[AgentRole.JUDGE].avatarUrl} className="w-8 h-8 rounded bg-stone-100 border border-stone-200" />
                            <span className="text-xs font-bold text-mocha-900">{getModelName(AgentRole.JUDGE)}</span>
                         </div>
                         <p className="text-sm font-serif text-mocha-800 italic leading-relaxed pl-3 border-l-2 border-amber-200 text-balance">
                           "{voteState.reasoning}"
                         </p>
                      </div>
                   </div>

                   <div className="flex items-center justify-center gap-4 py-4 border-t border-stone-200 border-b mt-auto mb-4 opacity-70">
                      <div className="text-center">
                         <div className="text-[10px] font-bold uppercase text-stone-400">Session ID</div>
                         <div className="font-mono font-bold text-sm text-mocha-900">#{Math.floor(Math.random() * 1000) + 2025}</div>
                      </div>
                      <div className="h-6 w-px bg-stone-200"></div>
                      <div className="text-center">
                         <div className="text-[10px] font-bold uppercase text-stone-400">Round</div>
                         <div className="font-mono font-bold text-sm text-mocha-900">{roundNumber}/{MAX_ROUNDS}</div>
                      </div>
                   </div>
                </div>
             </div>
          </aside>

          <main className="flex-1 flex flex-col h-full relative bg-marble">
             <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-[#FDFBF7] via-[#FDFBF7]/95 to-transparent px-6 pt-6 pb-12 pointer-events-none transition-opacity duration-500">
                <div className="max-w-3xl mx-auto text-center pointer-events-auto">
                  <div className="inline-block border-b-2 border-amber-500/30 pb-2 mb-2">
                    <h2 className="font-display font-bold text-mocha-950 text-lg md:text-xl drop-shadow-sm leading-tight">{topic}</h2>
                  </div>
                </div>
             </div>

             <div 
               ref={scrollRef}
               className="flex-1 overflow-y-auto px-4 md:px-12 pt-24 pb-24 space-y-8 no-scrollbar scroll-smooth"
             >
               {transcript.map((entry) => {
                  const isPro = entry.role === AgentRole.PRO;
                  const isMod = entry.role === AgentRole.MODERATOR;

                  if (isMod) {
                    return (
                      <div key={entry.id} className="flex justify-center py-4 animate-slide-up">
                        <div className="relative bg-white border border-stone-200 px-8 py-4 shadow-parchment max-w-2xl text-center transform rotate-1">
                           <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-stone-200 rounded-full opacity-50 ring-4 ring-[#FDFBF7]"></div>
                           <div className="font-display text-[10px] font-bold text-mocha-900 mb-2 uppercase tracking-widest border-b border-stone-100 pb-1 inline-block">Speaker of the House</div>
                           <p className="text-sm font-serif text-mocha-800 leading-relaxed">"{entry.text}"</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={entry.id} className={`flex gap-4 md:gap-6 ${isPro ? 'flex-row' : 'flex-row-reverse'} animate-message-pop group`}>
                       <div className="flex flex-col items-center gap-2 shrink-0">
                          <div className="relative group-hover:-translate-y-1 transition-transform duration-300">
                            <img 
                              src={AGENTS[entry.role].avatarUrl} 
                              className={`w-12 h-12 md:w-14 md:h-14 rounded bg-stone-100 object-cover shadow-md border border-stone-200`}
                              alt={entry.agentName}
                            />
                            <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shadow-sm whitespace-nowrap ${isPro ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-200 text-stone-700 border-stone-300'}`}>
                              {isPro ? 'Pro' : 'Con'}
                            </div>
                          </div>
                       </div>
                       
                       <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${isPro ? 'items-start' : 'items-end'}`}>
                          <div className={`relative p-6 md:p-7 shadow-parchment text-sm md:text-base leading-relaxed border transition-all hover:shadow-lg bg-white
                             ${isPro 
                               ? 'rounded-tr-xl rounded-br-xl rounded-bl-xl border-l-4 border-l-amber-500 border-y-stone-200 border-r-stone-200' 
                               : 'rounded-tl-xl rounded-bl-xl rounded-br-xl border-r-4 border-r-stone-500 border-y-stone-200 border-l-stone-200'
                             }`}>
                             
                             <div className={`flex items-center gap-2 mb-3 pb-2 border-b border-stone-100 ${isPro ? '' : 'flex-row-reverse'}`}>
                               <span className="font-display font-bold text-mocha-950 text-sm">
                                 {AGENTS[entry.role].name}
                               </span>
                               <span className="text-[10px] text-stone-400 font-mono uppercase bg-stone-50 px-1 rounded">
                                 {entry.modelName}
                               </span>
                             </div>

                             <p className="hansard-text text-mocha-900 prose-dropcap">{entry.text}</p>
                          </div>
                       </div>
                    </div>
                  );
               })}

               {activeRole && activeRole !== AgentRole.JUDGE && (
                 <div className={`flex gap-4 animate-fade-in items-end ${activeRole === AgentRole.PRO ? 'flex-row' : activeRole === AgentRole.CON ? 'flex-row-reverse' : 'justify-center'}`}>
                    {activeRole !== AgentRole.MODERATOR && (
                      <div className="w-14 flex justify-center pb-2">
                         <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce"></div>
                      </div>
                    )}
                    <div className="bg-mocha-900 text-amber-50 px-5 py-2 rounded-t-xl rounded-b-md flex items-center gap-3 shadow-podium opacity-90 scale-95 origin-bottom animate-slide-up">
                       <div className="flex space-x-0.5 h-3 items-end">
                          <div className="w-0.5 bg-amber-400 animate-[height_0.8s_ease-in-out_infinite] h-2"></div>
                          <div className="w-0.5 bg-amber-400 animate-[height_0.8s_ease-in-out_0.2s_infinite] h-3"></div>
                          <div className="w-0.5 bg-amber-400 animate-[height_0.8s_ease-in-out_0.4s_infinite] h-1"></div>
                       </div>
                       <span className="text-[10px] font-bold uppercase tracking-widest">{getModelName(activeRole)} Speaking</span>
                    </div>
                 </div>
               )}
               
               <div className="h-12"></div>
             </div>

             <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col">
               <div className="pointer-events-auto flex justify-center pb-4 relative z-20">
                 {isProcessing ? (
                   <button 
                     onClick={stopDebate}
                     className="bg-white border border-stone-300 shadow-lg px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-stone-600 hover:bg-stone-50 transition-all active:scale-95 flex items-center gap-2 group"
                   >
                     <span className="w-2 h-2 bg-red-500 rounded-full group-hover:animate-pulse"></span>
                     Pause
                   </button>
                 ) : (
                   <button 
                     onClick={() => conductDebateRound(transcript, roundNumber)}
                     className="bg-mocha-900 shadow-xl px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest text-amber-50 hover:bg-mocha-800 transition-all active:scale-95 flex items-center gap-2"
                   >
                     <GavelIcon className="w-4 h-4" />
                     Resume
                   </button>
                 )}
               </div>
               
               {currentAction && (
                 <NewsTicker text={currentAction} />
               )}
             </div>
          </main>
        </div>
      )}

      {appState === 'CONCLUDED' && (
        <main className="flex-1 overflow-y-auto p-4 md:p-12 animate-fade-in bg-marble relative">
           <div className="max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden border-t-8 border-mocha-900 relative min-h-[80vh] flex flex-col">
              
              <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                <svg width="200" height="200" viewBox="0 0 200 200" fill="currentColor" className="text-mocha-900">
                  <circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="4" fill="none" />
                  <circle cx="100" cy="100" r="70" stroke="currentColor" strokeWidth="2" fill="none" />
                  <path d="M100 20 L100 180 M20 100 L180 100" stroke="currentColor" strokeWidth="1" />
                </svg>
              </div>

              {/* The Stamp */}
              <VerdictStamp isPassed={isMotionPassed} />

              <div className="p-12 text-center border-b border-stone-200">
                 <div className="inline-block border-b border-amber-500 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-mocha-900">Official Dossier</span>
                 </div>
                 <h1 className="text-3xl md:text-5xl font-display font-bold text-mocha-950 mb-8 leading-tight">{topic}</h1>
                 
                 <div className="flex justify-center gap-8 md:gap-16">
                    <div className="text-center">
                       <div className="text-5xl font-display font-bold text-amber-600">{finalProScore}</div>
                       <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mt-1">Affirmative</div>
                    </div>
                    <div className="w-px bg-stone-200 h-16"></div>
                    <div className="text-center">
                       <div className="text-5xl font-display font-bold text-stone-600">{100 - finalProScore}</div>
                       <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mt-1">Opposition</div>
                    </div>
                 </div>
              </div>
              
              <div className="p-8 md:p-16 space-y-12 flex-1">
                 {finalSummary && (
                   <div className="prose prose-amber mx-auto text-center max-w-2xl bg-stone-50 p-6 rounded-lg border border-stone-100 shadow-inner">
                      <p className="text-lg font-serif text-mocha-900 leading-loose italic">"{finalSummary}"</p>
                   </div>
                 )}

                 <div className="space-y-12 relative">
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-stone-200 hidden md:block border-l border-dashed border-stone-300"></div>

                    {rounds.map((round, i) => (
                       <div key={i} className="relative">
                          <div className="flex justify-center mb-6 md:mb-0 md:absolute md:left-1/2 md:-translate-x-1/2 md:top-0 z-10">
                             <div className="bg-white border border-stone-200 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-stone-400 shadow-sm">
                               Round {round.roundNumber}
                             </div>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-8 md:gap-16">
                             <div className="bg-white p-6 shadow-sm border border-stone-100 border-l-4 border-l-amber-400 hover:shadow-md transition-shadow rounded-r-lg">
                                <div className="text-[10px] font-bold uppercase text-amber-600 mb-2 flex justify-between">
                                  <span>Proponent</span>
                                </div>
                                <p className="text-sm font-serif text-mocha-900/80 leading-relaxed">{round.proText}</p>
                             </div>
                             <div className="bg-white p-6 shadow-sm border border-stone-100 border-r-4 border-r-stone-400 hover:shadow-md transition-shadow rounded-l-lg text-right md:text-left">
                                <div className="text-[10px] font-bold uppercase text-stone-500 mb-2 flex justify-between flex-row-reverse md:flex-row">
                                  <span>Skeptic</span>
                                </div>
                                <p className="text-sm font-serif text-mocha-900/80 leading-relaxed">{round.conText}</p>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
                 
                 <div className="flex justify-center pt-12 border-t border-stone-200">
                    <button onClick={() => window.print()} className="bg-mocha-900 text-white px-8 py-3 rounded shadow-lg text-xs font-bold uppercase tracking-widest hover:bg-mocha-800 transition-transform hover:-translate-y-1 active:translate-y-0">
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