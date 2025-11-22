
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

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [appState, setAppState] = useState<AppState>('SETUP');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [voteState, setVoteState] = useState<VoteState>({ proScore: 50, conScore: 50, reasoning: 'Waiting for session to commence...' });
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [finalSummary, setFinalSummary] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAction, setCurrentAction] = useState('');
  const [roundNumber, setRoundNumber] = useState(0);
  const [activeRole, setActiveRole] = useState<AgentRole | null>(null);

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
    
    await wait(1000);
    const closingEntry = createEntry(AgentRole.MODERATOR, reason);
    setTranscript(prev => [...prev, closingEntry]);
    setActiveRole(null);
    
    try {
      setCurrentAction("Drafting dossier...");
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

    await wait(1000);
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
      // 1. Proponent
      if (!isDebatingRef.current) return;
      setActiveRole(AgentRole.PRO);
      const proModel = selectedModels[AgentRole.PRO];
      const proName = getModelName(AgentRole.PRO);
      setCurrentAction(`${AGENTS[AgentRole.PRO].name} (${proName}) is presenting...`);
      
      const proText = await generateCompletion({
        model: proModel,
        systemInstruction: AGENTS[AgentRole.PRO].systemInstruction,
        prompt: `Topic: ${topic}. History: ${context}. Round ${currentRound}/${MAX_ROUNDS}. Argue IN FAVOR. Under 80 words.`
      });
      
      setActiveRole(null);
      const proEntry = createEntry(AgentRole.PRO, proText || "I rest my case.");
      setTranscript(prev => [...prev, proEntry]);
      roundHistory.push(proEntry);
      setCurrentAction("..."); 
      await wait(2000);

      // 2. Opponent
      if (!isDebatingRef.current) return;
      setActiveRole(AgentRole.CON);
      const conModel = selectedModels[AgentRole.CON];
      const conName = getModelName(AgentRole.CON);
      setCurrentAction(`${AGENTS[AgentRole.CON].name} (${conName}) is responding...`);

      const conText = await generateCompletion({
        model: conModel,
        systemInstruction: AGENTS[AgentRole.CON].systemInstruction,
        prompt: `Topic: ${topic}. History: ${context}. Proponent said: "${proEntry.text}". Round ${currentRound}/${MAX_ROUNDS}. Argue AGAINST. Under 80 words.`
      });

      setActiveRole(null);
      const conEntry = createEntry(AgentRole.CON, conText || "No further objections.");
      setTranscript(prev => [...prev, conEntry]);
      roundHistory.push(conEntry);
      setCurrentAction("...");
      await wait(2000);

      // 3. Judge
      if (!isDebatingRef.current) return;
      setActiveRole(AgentRole.JUDGE);
      const judgeModel = selectedModels[AgentRole.JUDGE];
      const judgeName = getModelName(AgentRole.JUDGE);
      setCurrentAction(`The Chamber (${judgeName}) is deliberating...`);
      await wait(1500);

      let result = { proScore: 50, reasoning: "Evaluating...", isConcluded: false };
      
      try {
        const judgeRaw = await generateCompletion({
          model: judgeModel,
          systemInstruction: AGENTS[AgentRole.JUDGE].systemInstruction,
          prompt: `Analyze round ${currentRound} on "${topic}". Pro: "${proEntry.text}". Con: "${conEntry.text}". Evaluate strength. Respond ONLY in JSON.`,
          jsonMode: true
        });
        
        // Clean markdown code blocks if present (common with some models)
        const cleanJson = judgeRaw.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(cleanJson);
      } catch (e) {
        console.warn("Judge JSON parse failed, using default", e);
        result = { proScore: 50, reasoning: "Complex arguments detected, proceeding to next round.", isConcluded: false };
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
      if (currentRound >= MIN_ROUNDS && (result.isConcluded || isKnockout)) {
        const reason = isKnockout ? "A decisive victory secured." : "Consensus reached.";
        concludeDebate(roundHistory, reason);
        return;
      }

      setCurrentAction("Preparing next round...");
      await wait(1500);

      if (isDebatingRef.current) {
        if (currentRound < MAX_ROUNDS) {
          conductDebateRound(roundHistory, currentRound + 1);
        } else {
          concludeDebate(roundHistory, "Time limit reached.");
        }
      }

    } catch (error) {
      console.error("Debate Error:", error);
      alert("Error connecting to AI Models. Please check your OpenRouter API Key.");
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
    setCurrentAction("Initializing...");
    
    try {
      await wait(800);
      const introText = await generateCompletion({
        model: DEFAULT_MODELS.MODERATOR,
        systemInstruction: AGENTS[AgentRole.MODERATOR].systemInstruction,
        prompt: `Topic: ${selectedTopic}. Introduce briefly.`
      });
      
      const introEntry = createEntry(AgentRole.MODERATOR, introText || "Welcome to the debate.");
      setActiveRole(null);
      setTranscript([introEntry]);
      setCurrentAction("Starting Round 1...");
      await wait(1500);
      conductDebateRound([introEntry], 1);
    } catch (e) {
      console.error(e);
      alert("Failed to start. Check API Key.");
      stopDebate();
      setAppState('SETUP');
    }
  };

  const finalProScore = voteState.proScore;
  const winner = finalProScore > 55 ? AGENTS[AgentRole.PRO].name : 
                 finalProScore < 45 ? AGENTS[AgentRole.CON].name : "Draw";

  return (
    <div className="h-dvh w-full flex flex-col bg-amber-50 overflow-hidden">
      {/* Navigation / Header */}
      <header className="flex-none bg-white/80 backdrop-blur-md border-b border-amber-200/50 h-16 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-2">
          <span className="bg-amber-500 w-6 h-6 rounded-md flex items-center justify-center text-white font-serif font-bold text-sm">C</span>
          <h1 className="text-xl font-serif font-bold text-mocha-900 tracking-tight hidden md:block">Consultaion <span className="text-xs opacity-50 font-sans font-normal ml-1">Multi-LLM Edition</span></h1>
        </div>
        <div className="flex items-center gap-4">
          {(appState === 'DEBATING' || appState === 'CONCLUDED') && (
            <button onClick={resetDebate} className="text-sm font-medium text-amber-800 hover:text-amber-600 transition-colors">
              New Debate
            </button>
          )}
        </div>
      </header>

      {appState === 'SETUP' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-3xl text-center space-y-8">
             <h1 className="text-4xl md:text-6xl font-serif font-black text-mocha-900 tracking-tight">
              Battle of the <span className="text-amber-600">LLMs</span>
             </h1>
             <p className="text-mocha-800/60 max-w-lg mx-auto">
               Select your fighters. Compare reasoning capabilities in real-time.
             </p>
             
             <div className="grid md:grid-cols-3 gap-4 text-left max-w-2xl mx-auto mb-8">
                {[AgentRole.PRO, AgentRole.CON, AgentRole.JUDGE].map((role) => (
                  <div key={role} className="bg-white p-4 rounded-2xl shadow-sm border border-amber-100">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2 block">
                      {AGENTS[role].name}
                    </label>
                    <select 
                      className="w-full text-sm font-medium text-mocha-900 bg-amber-50/50 border-none rounded-lg p-2 focus:ring-2 focus:ring-amber-200 outline-none"
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
               <div className="absolute inset-0 bg-amber-300 rounded-full blur opacity-20 group-hover:opacity-30 transition-opacity"></div>
               <input
                 type="text"
                 value={topic}
                 onChange={(e) => setTopic(e.target.value)}
                 placeholder="Enter a debate topic..."
                 className="relative w-full px-8 py-5 text-lg bg-white rounded-full border-2 border-amber-100 shadow-xl shadow-amber-100/50 focus:border-amber-400 focus:ring-4 focus:ring-amber-100/50 outline-none transition-all placeholder-mocha-100 text-mocha-900"
                 onKeyDown={(e) => e.key === 'Enter' && startDebate()}
               />
               <button
                 onClick={() => startDebate()}
                 disabled={!topic.trim() || isProcessing}
                 className="absolute right-2 top-2 bottom-2 px-6 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-full transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
               >
                 Start
               </button>
             </div>

             <div className="pt-4 animate-slide-up" style={{animationDelay: '0.1s'}}>
                <div className="flex flex-wrap justify-center gap-3">
                  {SUGGESTED_TOPICS.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => { setTopic(t); startDebate(t); }}
                      className="px-4 py-2 bg-white border border-amber-100 rounded-full text-sm text-mocha-800 hover:border-amber-300 hover:bg-amber-50 transition-all shadow-sm hover:shadow-md"
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
          {/* Sidebar */}
          <aside className="lg:w-96 bg-white/60 backdrop-blur-md border-b lg:border-b-0 lg:border-r border-amber-200/50 flex flex-col shrink-0 z-10 lg:h-full relative">
             {/* Mobile Compact View */}
             <div className="lg:hidden px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex-1 flex flex-col gap-1">
                   <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-mocha-800/60">
                      <span>{getModelName(AgentRole.PRO).split(' ')[0]}</span>
                      <span>{getModelName(AgentRole.CON).split(' ')[0]}</span>
                   </div>
                   <div className="h-2 bg-stone-200 rounded-full overflow-hidden flex">
                      <div className="bg-amber-500 transition-all duration-700" style={{ width: `${voteState.proScore}%` }}></div>
                   </div>
                </div>
                <div className="text-xl font-bold font-serif text-mocha-900 tabular-nums">{voteState.proScore}%</div>
             </div>

             {/* Desktop Expanded View */}
             <div className="hidden lg:flex flex-col h-full p-8">
                <div className="flex-1 flex flex-col justify-center items-center gap-8">
                   <div className="relative w-64 h-64">
                      {/* Circular Progress Visualization */}
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle className="text-stone-200" strokeWidth="8" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" />
                        <circle 
                          className="text-amber-500 transition-all duration-1000 ease-out" 
                          strokeWidth="8" 
                          strokeDasharray={264}
                          strokeDashoffset={264 - (264 * voteState.proScore) / 100}
                          strokeLinecap="round"
                          stroke="currentColor" 
                          fill="transparent" 
                          r="42" cx="50" cy="50" 
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                         <span className="text-4xl font-serif font-bold text-mocha-900">{voteState.proScore}%</span>
                         <span className="text-xs font-bold uppercase text-amber-600 tracking-wider mt-1 text-center px-2">
                           {getModelName(AgentRole.PRO)}
                         </span>
                      </div>
                   </div>

                   <div className={`p-6 bg-white rounded-2xl border border-amber-100 shadow-sm transition-all duration-500 ${activeRole === AgentRole.JUDGE ? 'ring-2 ring-amber-400 scale-105' : ''}`}>
                      <div className="flex items-center gap-2 mb-3">
                         <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                         <span className="text-xs font-bold uppercase tracking-widest text-mocha-800/50">
                           Judge: {getModelName(AgentRole.JUDGE)}
                         </span>
                      </div>
                      <p className="text-sm text-mocha-800 leading-relaxed italic">"{voteState.reasoning}"</p>
                   </div>
                </div>
                
                <div className="mt-auto pt-6 border-t border-amber-100 text-center">
                   <p className="text-xs font-mono text-stone-400 uppercase">Round {roundNumber} / {MAX_ROUNDS}</p>
                </div>
             </div>
          </aside>

          {/* Main Chat Area */}
          <main className="flex-1 flex flex-col h-full relative">
             {/* Topic Header */}
             <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-amber-50 via-amber-50 to-transparent px-6 pt-6 pb-12 pointer-events-none">
                <h2 className="text-center font-serif font-bold text-mocha-900 text-lg md:text-2xl drop-shadow-sm pointer-events-auto line-clamp-2">{topic}</h2>
             </div>

             {/* Messages List */}
             <div 
               ref={scrollRef}
               className="flex-1 overflow-y-auto px-4 md:px-8 pt-24 pb-32 space-y-6 no-scrollbar scroll-smooth"
             >
               {transcript.map((entry) => {
                  const isPro = entry.role === AgentRole.PRO;
                  const isMod = entry.role === AgentRole.MODERATOR;

                  if (isMod) {
                    return (
                      <div key={entry.id} className="flex justify-center py-4 animate-slide-up">
                        <div className="bg-stone-100/80 backdrop-blur-sm border border-stone-200 px-6 py-3 rounded-full text-xs md:text-sm font-medium text-stone-600 shadow-sm max-w-[90%] text-center">
                           {entry.text}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={entry.id} className={`flex gap-3 md:gap-5 ${isPro ? 'flex-row' : 'flex-row-reverse'} animate-message-pop group`}>
                       <div className="flex flex-col items-center gap-1 shrink-0">
                          <img 
                            src={AGENTS[entry.role].avatarUrl} 
                            className={`w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white object-cover shadow-md border-2 ${isPro ? 'border-amber-100' : 'border-stone-200'}`}
                            alt={entry.agentName}
                          />
                       </div>
                       
                       <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isPro ? 'items-start' : 'items-end'}`}>
                          <div className="flex items-center gap-2 mb-1 px-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                              {AGENTS[entry.role].name}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${isPro ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-600'}`}>
                              {entry.modelName}
                            </span>
                          </div>
                          <div className={`p-4 md:p-5 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed backdrop-blur-sm border transition-all hover:shadow-md
                             ${isPro 
                               ? 'bg-white/90 border-amber-100 text-mocha-900 rounded-tl-none' 
                               : 'bg-stone-800/90 border-stone-700 text-white rounded-tr-none'
                             }`}>
                             <p className="hansard-text">{entry.text}</p>
                          </div>
                       </div>
                    </div>
                  );
               })}

               {/* Typing Indicators */}
               {activeRole && activeRole !== AgentRole.JUDGE && (
                 <div className={`flex gap-3 animate-fade-in ${activeRole === AgentRole.PRO ? 'flex-row' : activeRole === AgentRole.CON ? 'flex-row-reverse' : 'justify-center'}`}>
                    {activeRole !== AgentRole.MODERATOR && (
                      <img src={AGENTS[activeRole].avatarUrl} className="w-8 h-8 rounded-lg opacity-50 grayscale" />
                    )}
                    <div className="bg-white/50 px-4 py-3 rounded-2xl flex items-center gap-1.5">
                       <span className="text-xs font-bold text-stone-400 mr-1">{getModelName(activeRole)}</span>
                       <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                       <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '0.15s'}}></div>
                       <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
                    </div>
                 </div>
               )}
               
               <div className="h-12"></div>
             </div>

             {/* Bottom Controls */}
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-20">
               {isProcessing ? (
                 <button 
                   onClick={stopDebate}
                   className="bg-white/90 backdrop-blur border border-stone-200 shadow-lg px-6 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-50 transition-transform active:scale-95 flex items-center gap-2"
                 >
                   <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                   Pause Session
                 </button>
               ) : (
                 <button 
                   onClick={() => conductDebateRound(transcript, roundNumber)}
                   className="bg-amber-600 shadow-lg shadow-amber-600/30 px-6 py-2 rounded-full text-sm font-bold text-white hover:bg-amber-700 transition-transform active:scale-95"
                 >
                   Resume Debate
                 </button>
               )}
             </div>
          </main>
        </div>
      )}

      {appState === 'CONCLUDED' && (
        <main className="flex-1 overflow-y-auto p-4 md:p-12 animate-fade-in">
           <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-amber-100">
              {/* Conclusion Header */}
              <div className="bg-mocha-900 p-8 md:p-12 text-center relative overflow-hidden">
                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
                 <h3 className="text-amber-400 text-xs font-bold uppercase tracking-[0.2em] mb-3 relative z-10">Final Verdict</h3>
                 <h1 className="text-3xl md:text-5xl font-serif font-bold text-white mb-6 relative z-10">{topic}</h1>
                 
                 <div className="inline-flex items-center bg-white/10 backdrop-blur rounded-2xl p-2 pr-6 gap-4 border border-white/10 relative z-10">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold bg-white ${finalProScore > 55 ? 'text-amber-600' : finalProScore < 45 ? 'text-stone-600' : 'text-stone-400'}`}>
                       {finalProScore}%
                    </div>
                    <div className="text-left">
                       <div className="text-xs text-white/50 uppercase font-bold">Winner</div>
                       <div className="text-lg font-bold text-white">{winner}</div>
                    </div>
                 </div>
              </div>
              
              {/* Summary & Rounds */}
              <div className="p-6 md:p-12 space-y-12">
                 {finalSummary && (
                   <div className="prose prose-amber mx-auto text-center">
                      <p className="text-xl font-serif text-mocha-900 leading-relaxed">"{finalSummary}"</p>
                   </div>
                 )}

                 <div className="space-y-4">
                    {rounds.map((round, i) => (
                       <div key={i} className="group">
                          <div className="flex items-center gap-4 mb-4">
                             <span className="h-px flex-1 bg-stone-200 group-hover:bg-amber-200 transition-colors"></span>
                             <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Round {round.roundNumber}</span>
                             <span className="h-px flex-1 bg-stone-200 group-hover:bg-amber-200 transition-colors"></span>
                          </div>
                          
                          <div className="grid md:grid-cols-2 gap-4">
                             <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100 hover:border-amber-200 transition-colors relative">
                                <div className="absolute top-2 right-4 text-[10px] font-bold text-amber-400/60 uppercase">{getModelName(AgentRole.PRO)}</div>
                                <div className="text-[10px] font-bold uppercase text-amber-600 mb-2">Proponent</div>
                                <p className="text-sm text-mocha-900/80 leading-relaxed">{round.proText}</p>
                             </div>
                             <div className="bg-stone-50/50 p-6 rounded-2xl border border-stone-200 hover:border-stone-300 transition-colors relative">
                                <div className="absolute top-2 right-4 text-[10px] font-bold text-stone-400/60 uppercase">{getModelName(AgentRole.CON)}</div>
                                <div className="text-[10px] font-bold uppercase text-stone-500 mb-2">Skeptic</div>
                                <p className="text-sm text-mocha-900/80 leading-relaxed">{round.conText}</p>
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>
                 
                 <div className="flex justify-center pt-8">
                    <button onClick={() => window.print()} className="text-stone-400 hover:text-stone-800 font-medium text-sm transition-colors">
                       Export Dossier PDF
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
