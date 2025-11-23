
import React, { useState, useEffect } from 'react';
import { Macro, KeyBinding, EditorAction } from '../types';
import { Trash2, Plus, Info, Code, List, Save, RotateCcw, Keyboard, Command } from 'lucide-react';
import { serializeMacros, parseMacros, expandMacros } from '../services/macroUtils';
import { normalizeKeyCombo, formatActionName } from '../services/keybindUtils';
import { DEFAULT_MACROS, DEFAULT_KEYBINDINGS } from '../constants';

interface MacrosPanelProps {
  macros: Macro[];
  setMacros: (macros: Macro[]) => void;
  keybindings: KeyBinding[];
  setKeybindings: (kb: KeyBinding[]) => void;
  onClose: () => void;
}

const AVAILABLE_ACTIONS: EditorAction[] = [
    'UNDO', 'REDO', 'DELETE_WORD', 'DELETE_LINE', 
    'MOVE_LINE_UP', 'MOVE_LINE_DOWN', 'SMART_FRACTION', 
    'INDENT', 'NEXT_TABSTOP'
];

export const MacrosPanel: React.FC<MacrosPanelProps> = ({ macros, setMacros, keybindings, setKeybindings, onClose }) => {
  const [tab, setTab] = useState<'macros' | 'keybinds'>('macros');

  // Macro State
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newTrigger, setNewTrigger] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newOptions, setNewOptions] = useState('mA');
  const [newPriority, setNewPriority] = useState(0);

  // Keybind State
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [newAction, setNewAction] = useState<EditorAction>('UNDO');

  useEffect(() => {
      if (mode === 'code') {
          setCode(serializeMacros(macros));
      }
  }, [mode, macros]);

  // --- MACRO HANDLERS ---
  const handleAddMacro = () => {
    if (!newTrigger || !newReplacement) return;
    const newMacro: Macro = {
      id: Date.now().toString(),
      trigger: newTrigger,
      replacement: newReplacement,
      options: newOptions,
      priority: newPriority,
    };
    setMacros([...macros, newMacro]);
    setNewTrigger('');
    setNewReplacement('');
    setNewOptions('mA');
    setNewPriority(0);
  };

  const handleDeleteMacro = (id: string | undefined) => {
    if (!id) return;
    setMacros(macros.filter(m => m.id !== id));
  };

  const handleSaveCode = () => {
      try {
          const parsed = parseMacros(code);
          setMacros(parsed);
          setError(null);
      } catch (e: any) {
          setError(e.message || "Invalid snippet syntax");
      }
  };

  const handleResetDefaults = () => {
      if (window.confirm("Are you sure you want to reset all settings to default?")) {
          try {
              const defaults = expandMacros(DEFAULT_MACROS);
              setMacros(defaults);
              setKeybindings(DEFAULT_KEYBINDINGS);
              if (mode === 'code') {
                  setCode(serializeMacros(defaults));
              }
          } catch (e) {
              console.error("Failed to load defaults", e);
          }
      }
  };

  // --- KEYBIND HANDLERS ---
  const handleKeyDownRecord = (e: React.KeyboardEvent) => {
      e.preventDefault();
      const combo = normalizeKeyCombo(e);
      setRecordingKey(combo);
  };

  const handleAddKeybind = () => {
      if (!recordingKey) return;
      // Remove existing binds for this key combo
      const filtered = keybindings.filter(k => k.keys !== recordingKey);
      const newBind: KeyBinding = {
          id: Date.now().toString(),
          keys: recordingKey,
          action: newAction
      };
      setKeybindings([...filtered, newBind]);
      setRecordingKey(null);
  };

  const handleDeleteKeybind = (id: string) => {
      setKeybindings(keybindings.filter(k => k.id !== id));
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-800">
      
      {/* TOP NAV */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <button 
            onClick={() => setTab('macros')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 flex items-center justify-center gap-2 ${tab === 'macros' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500'}`}
          >
              <List size={16} /> Text Macros
          </button>
          <button 
            onClick={() => setTab('keybinds')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 flex items-center justify-center gap-2 ${tab === 'keybinds' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500'}`}
          >
              <Keyboard size={16} /> Keybinds
          </button>
      </div>

      {/* TOOLBAR */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
        {tab === 'macros' ? (
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button 
                    onClick={() => setMode('visual')}
                    className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${mode === 'visual' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500'}`}
                >
                    Visual
                </button>
                <button 
                    onClick={() => setMode('code')}
                    className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${mode === 'code' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500'}`}
                >
                    <Code size={14} /> JSON
                </button>
            </div>
        ) : (
            <div className="text-xs text-slate-500 font-medium">Custom Shortcuts</div>
        )}
        
        <div className="flex items-center gap-2">
             <button 
                onClick={handleResetDefaults}
                className="text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
                <RotateCcw size={14} /> Reset
            </button>
            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 md:hidden">Close</button>
        </div>
      </div>

      {/* --- MACROS CONTENT --- */}
      {tab === 'macros' && (
        <>
          {mode === 'visual' && (
            <>
                <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-4">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Trigger</label>
                        <input 
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            placeholder=";a"
                            value={newTrigger}
                            onChange={(e) => setNewTrigger(e.target.value)}
                        />
                    </div>
                    <div className="col-span-6">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Replacement</label>
                        <input 
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            placeholder="\alpha"
                            value={newReplacement}
                            onChange={(e) => setNewReplacement(e.target.value)}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Opts</label>
                        <input 
                            className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            placeholder="mA"
                            value={newOptions}
                            onChange={(e) => setNewOptions(e.target.value)}
                        />
                    </div>
                    </div>
                    <div className="flex justify-end">
                        <button 
                            onClick={handleAddMacro}
                            disabled={!newTrigger || !newReplacement}
                            className="px-4 py-1.5 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded text-sm transition-colors font-medium"
                        >
                        <Plus size={16} /> Add Macro
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {macros.map((macro, idx) => {
                        const triggerDisplay = macro.trigger instanceof RegExp ? macro.trigger.toString() : macro.trigger;
                        const replaceDisplay = typeof macro.replacement === 'function' ? '(function)' : macro.replacement;
                        
                        return (
                            <div key={macro.id || idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors group">
                                <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-3 font-mono text-indigo-600 dark:text-indigo-400 font-bold text-xs sm:text-sm truncate" title={String(triggerDisplay)}>{String(triggerDisplay)}</div>
                                <div className="col-span-7 font-mono text-slate-600 dark:text-slate-400 text-xs sm:text-sm truncate" title={String(replaceDisplay)}>{String(replaceDisplay)}</div>
                                <div className="col-span-2 text-xs text-slate-400 font-mono text-right px-2 border-l border-slate-200 dark:border-slate-700">
                                    {macro.options}
                                </div>
                                </div>
                                <button 
                                onClick={() => handleDeleteMacro(macro.id)}
                                className="ml-2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                                >
                                <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </>
          )}

          {mode === 'code' && (
              <div className="flex-1 flex flex-col p-0">
                  <div className="flex-1 relative">
                    <textarea 
                        className="w-full h-full p-4 font-mono text-sm bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-300 resize-none focus:outline-none"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        spellCheck={false}
                    />
                    {error && (
                        <div className="absolute bottom-4 left-4 right-4 bg-red-100 dark:bg-red-900/80 text-red-700 dark:text-red-200 p-2 rounded text-xs border border-red-200 dark:border-red-800">
                            Syntax Error: {error}
                        </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <Info size={14}/>
                        Supports JS Objects, Regex Literals.
                      </div>
                      <button 
                        onClick={handleSaveCode}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium flex items-center gap-2"
                      >
                          <Save size={16}/> Apply Changes
                      </button>
                  </div>
              </div>
          )}
        </>
      )}

      {/* --- KEYBINDS CONTENT --- */}
      {tab === 'keybinds' && (
          <div className="flex-1 flex flex-col">
              <div className="p-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 space-y-3">
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="block text-xs font-medium text-slate-500 mb-1">Shortcut</label>
                           <input 
                                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-center font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
                                value={recordingKey || "Click to Record"}
                                onKeyDown={handleKeyDownRecord}
                                readOnly
                                placeholder="Click & Press Keys"
                           />
                       </div>
                       <div>
                           <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
                           <select 
                                className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={newAction}
                                onChange={(e) => setNewAction(e.target.value as EditorAction)}
                           >
                               {AVAILABLE_ACTIONS.map(action => (
                                   <option key={action} value={action}>{formatActionName(action)}</option>
                               ))}
                           </select>
                       </div>
                   </div>
                   <div className="flex justify-end">
                        <button 
                            onClick={handleAddKeybind}
                            disabled={!recordingKey}
                            className="px-4 py-1.5 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded text-sm transition-colors font-medium"
                        >
                        <Plus size={16} /> Add Keybind
                        </button>
                   </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {keybindings.length === 0 && (
                        <div className="text-center p-8 text-slate-400 text-sm">No custom keybinds set.</div>
                    )}
                    {keybindings.map((kb) => (
                        <div key={kb.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="min-w-[100px] px-2 py-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {kb.keys}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <Command size={14} className="text-slate-400"/>
                                    {formatActionName(kb.action)}
                                </div>
                            </div>
                            <button 
                                onClick={() => handleDeleteKeybind(kb.id)}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
              </div>
          </div>
      )}
    </div>
  );
};
