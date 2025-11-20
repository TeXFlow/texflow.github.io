


import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { checkMacroTrigger, processReplacement, TabStop } from '../services/macroEngine';
import { Macro } from '../types';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  macros: Macro[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  forceMath?: boolean;
}

interface HistoryState {
    value: string;
    cursor: number;
}

const getEnclosingMatrixEnvironment = (text: string, cursor: number): string | null => {
    const before = text.substring(0, cursor);
    const multilineEnvs = [
        'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'matrix', 
        'cases', 'align', 'align*', 'array', 'gather', 'gather*', 'split'
    ];
    
    const tagRegex = /\\(begin|end)\{([a-zA-Z0-9*]+)\}/g;
    const matches = [];
    let match;
    while ((match = tagRegex.exec(before)) !== null) {
        matches.push({
            type: match[1],
            env: match[2],
            index: match.index
        });
    }

    const stack: string[] = [];
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        if (m.type === 'end') {
            stack.push(m.env);
        } else {
            if (stack.length > 0 && stack[stack.length - 1] === m.env) {
                stack.pop();
            } else {
                if (multilineEnvs.includes(m.env)) {
                    return m.env;
                }
                return null; 
            }
        }
    }

    return null;
};

export const Editor: React.FC<EditorProps> = ({ 
  value, 
  onChange, 
  macros, 
  placeholder = "Type LaTeX here...", 
  className = "",
  autoFocus = false,
  forceMath = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Selection Persistence (Stores start and end to preserve highlights)
  const pendingSelectionRef = useRef<{ start: number, end: number } | null>(null);

  // Snippet State
  const snippetTabStops = useRef<TabStop[]>([]);

  // History Management
  const historyRef = useRef<HistoryState[]>([{ value, cursor: 0 }]);
  const historyPtrRef = useRef(0);
  const lastTypeTime = useRef(0);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
        textareaRef.current.focus();
    }
  }, [autoFocus]);

  useLayoutEffect(() => {
    if (pendingSelectionRef.current !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(pendingSelectionRef.current.start, pendingSelectionRef.current.end);
      pendingSelectionRef.current = null;
    }
  }, [value]);

  const setPendingSelection = (start: number, end: number = start) => {
      pendingSelectionRef.current = { start, end };
  };

  const saveHistory = (newValue: string, newCursor: number, immediate = false) => {
      const now = Date.now();
      const state: HistoryState = { value: newValue, cursor: newCursor };

      if (historyPtrRef.current === historyRef.current.length - 1) {
          if (immediate || now - lastTypeTime.current > 1000) {
               historyRef.current.push(state);
               historyPtrRef.current++;
          } else {
               historyRef.current[historyPtrRef.current] = state;
          }
      } else {
          historyRef.current = historyRef.current.slice(0, historyPtrRef.current + 1);
          historyRef.current.push(state);
          historyPtrRef.current++;
      }
      lastTypeTime.current = now;
  };

  // Helper to shift tab stops when text is inserted/deleted programmatically
  const shiftTabStops = (diff: number, insertionPoint: number) => {
      if (snippetTabStops.current.length > 0) {
        const changeStart = insertionPoint;
        snippetTabStops.current = snippetTabStops.current.map(stop => {
            if (stop.start >= changeStart) {
                return { start: Math.max(0, stop.start + diff), end: Math.max(0, stop.end + diff) };
            }
            return stop;
        });
        // Filter out stops that collapsed to negative/invalid or precede the edit weirdly?
        // Actually we keep them if valid.
        snippetTabStops.current = snippetTabStops.current.filter(s => s.start >= 0);
      }
  };

  // Unified Text Updater used by Hotkeys and Events
  const updateText = (newValue: string, newCursor: number, insertionPoint: number, diff: number, immediateHistory = true) => {
      shiftTabStops(diff, insertionPoint);
      saveHistory(newValue, newCursor, immediateHistory);
      onChange(newValue);
      setPendingSelection(newCursor);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    const diff = newValue.length - value.length;
    
    // Heuristic: For typing, insertion point is where cursor is (approx). 
    // If deletion (diff < 0), insertion point is newCursorPos.
    // If insertion (diff > 0), insertion point is newCursorPos - diff.
    const changeStart = diff > 0 ? newCursorPos - diff : newCursorPos;

    // Update TabStops manually here before Macro Trigger potentially overwrites them
    shiftTabStops(diff, changeStart);

    // Trigger macros on input
    if (newValue.length > value.length) {
       const macroResult = checkMacroTrigger(newValue, newCursorPos, macros, forceMath);
       
       if (macroResult) {
         // Save history
         saveHistory(macroResult.text, macroResult.selection.end, true);
         onChange(macroResult.text);
         
         // Selection logic: highlight the first tabstop
         setPendingSelection(macroResult.selection.start, macroResult.selection.end);
         
         // Set active tabstops
         snippetTabStops.current = macroResult.tabStops;
         return;
       }
    }

    saveHistory(newValue, newCursorPos);
    onChange(newValue);
    setPendingSelection(newCursorPos);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // --- UNDO / REDO ---
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        let newState: HistoryState | null = null;
        if (e.shiftKey) {
            if (historyPtrRef.current < historyRef.current.length - 1) {
                historyPtrRef.current++;
                newState = historyRef.current[historyPtrRef.current];
            }
        } else {
            if (historyPtrRef.current > 0) {
                historyPtrRef.current--;
                newState = historyRef.current[historyPtrRef.current];
            }
        }
        if (newState) {
            onChange(newState.value);
            setPendingSelection(newState.cursor);
            snippetTabStops.current = []; // Clear tabstops on undo
        }
        return;
    }

    // --- FRACTION HOTKEY (Alt + /) ---
    if (e.altKey && e.key === '/') {
        e.preventDefault();
        
        // Smart selection logic
        let targetStart = start;
        let targetEnd = end;

        if (start === end) {
            // No selection, find previous atom
            // Case 1: Closing bracket
            const prevChar = value[start - 1];
            if ([')', '}', ']'].includes(prevChar)) {
                const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
                const open = pairs[prevChar];
                let balance = 1;
                let i = start - 2;
                while (i >= 0) {
                    if (value[i] === prevChar) balance++;
                    if (value[i] === open) balance--;
                    if (balance === 0) {
                        targetStart = i;
                        break;
                    }
                    i--;
                }
            } 
            // Case 2: Word / Alphanumeric
            else {
                let i = start - 1;
                // Scan back until space or special char (but allow sub/superscripts)
                while (i >= 0 && /[\w\d\^_]/.test(value[i])) {
                    i--;
                }
                targetStart = i + 1;
            }
        }

        if (targetStart < targetEnd || (start === end && targetStart < start)) {
             const selection = value.substring(targetStart, Math.max(targetEnd, start));
             
             // Use dummy macro to generate tabstops efficiently
             const fractionMacro = { 
                 trigger: "", 
                 replacement: "\\frac{${VISUAL}}{${1:}}$0", 
                 options: "mA" 
             };
             
             const { text: replaceText, selection: newSel, tabStops } = processReplacement(fractionMacro, [], selection);
             
             const newValue = value.substring(0, targetStart) + replaceText + value.substring(Math.max(targetEnd, start));
             const diff = newValue.length - value.length;
             
             // Update text and shift existing stops (though fraction usually consumes them or starts new context)
             updateText(newValue, targetStart + newSel.end, targetStart, diff, true);
             setPendingSelection(targetStart + newSel.start, targetStart + newSel.end);
             
             // Set new tabstops relative to insertion
             snippetTabStops.current = tabStops.map(ts => ({
                 start: targetStart + ts.start,
                 end: targetStart + ts.end
             }));
        }
        return;
    }

    // --- MOVE LINE UP/DOWN (Alt + Arrows) ---
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        
        const lines = value.split('\n');
        const startLineIdx = value.substring(0, start).split('\n').length - 1;
        let endLineIdx = value.substring(0, end).split('\n').length - 1;
        
        if (end > start && value[end - 1] === '\n') {
             endLineIdx--;
        }

        if (e.key === 'ArrowUp') {
             if (startLineIdx > 0) {
                 const lineAbove = lines[startLineIdx - 1];
                 const movingLines = lines.slice(startLineIdx, endLineIdx + 1);
                 
                 lines.splice(startLineIdx, movingLines.length);
                 lines.splice(startLineIdx - 1, 0, ...movingLines);
                 
                 const newValue = lines.join('\n');
                 const shift = -(lineAbove.length + 1); // Shift by length of line swapped
                 const diff = 0; // Total length unchanged
                 
                 // Special case: Text content same length, but positions swapped. 
                 // Tabstops should arguably move with the line, but that is complex. 
                 // For now, we clear tabstops on line move to avoid chaos.
                 snippetTabStops.current = [];
                 
                 saveHistory(newValue, start + shift, true); 
                 onChange(newValue);
                 setPendingSelection(start + shift, end + shift);
             }
        } else if (e.key === 'ArrowDown') {
             if (endLineIdx < lines.length - 1) {
                 const lineBelow = lines[endLineIdx + 1];
                 const movingLines = lines.slice(startLineIdx, endLineIdx + 1);
                 
                 lines.splice(startLineIdx, movingLines.length);
                 lines.splice(startLineIdx + 1, 0, ...movingLines);
                 
                 const newValue = lines.join('\n');
                 const shift = lineBelow.length + 1;
                 
                 snippetTabStops.current = [];
                 
                 saveHistory(newValue, start + shift, true);
                 onChange(newValue);
                 setPendingSelection(start + shift, end + shift);
             }
        }
        return;
    }

    // --- TAB KEY ---
    if (e.key === 'Tab') {
        e.preventDefault();

        // 1. Clean up zero-width tabstops at current position
        // If we are already "at" a tabstop (length 0), we should consume it and move to next,
        // otherwise we might get stuck.
        // NOTE: We use a small threshold or precise check.
        while (snippetTabStops.current.length > 0) {
             const next = snippetTabStops.current[0];
             // Logic: If cursor is exactly at the start of a tabstop, and that tabstop is zero width (just a marker), remove it.
             // Or if we are inside the range? No, ranges are for selecting.
             if (next.start === next.end && next.start === start) {
                 snippetTabStops.current.shift();
                 continue;
             }
             break;
        }

        // 2. Active Snippet Tabstops
        if (snippetTabStops.current.length > 0) {
            let shouldJump = true;
            
            // Heuristic for matrix env
            const matrixEnv = getEnclosingMatrixEnvironment(value, start);
            if (matrixEnv) {
                const after = value.substring(start);
                const endTag = `\\end{${matrixEnv}}`;
                const endTagIdx = after.indexOf(endTag);
                
                if (endTagIdx !== -1) {
                    const matrixEnd = start + endTagIdx;
                    const nextStop = snippetTabStops.current[0];
                    
                    // If next stop is outside matrix (physically after the end tag), 
                    // we prefer staying in matrix with '&' UNLESS we are at the very end of a row/content?
                    // Obsidian logic: Tab inserts & unless we are strictly jumping out.
                    if (nextStop && nextStop.start >= matrixEnd) {
                        shouldJump = false;
                    }
                }
            }

            if (shouldJump) {
                const nextStop = snippetTabStops.current.shift();
                if (nextStop) {
                    // Safety check: ensure bounds are valid
                    const safeStart = Math.max(0, Math.min(nextStop.start, value.length));
                    const safeEnd = Math.max(0, Math.min(nextStop.end, value.length));
                    textarea.setSelectionRange(safeStart, safeEnd);
                    return;
                }
            }
        }

        // 3. Matrix Environment Check
        const matrixEnv = getEnclosingMatrixEnvironment(value, start);
        if (matrixEnv) {
             const insertStr = " & ";
             const newValue = value.substring(0, start) + insertStr + value.substring(end);
             const newCursor = start + insertStr.length;
             updateText(newValue, newCursor, start, insertStr.length);
             return;
        }

        // 4. "Tab Out" (Skip closing delimiters)
        if (start === end && start < value.length) {
            const nextChar = value[start];
            const closingDelimiters = ['}', ']', ')', '$', '>', '"', "'"];
            if (closingDelimiters.includes(nextChar)) {
                textarea.setSelectionRange(start + 1, start + 1);
                return;
            }
        }

        // 5. Indentation
        const indent = "  "; 
        const newValue = value.substring(0, start) + indent + value.substring(end);
        const newCursor = start + indent.length;
        updateText(newValue, newCursor, start, indent.length);
        return;
    }
    
    // --- ESCAPE ---
    if (e.key === 'Escape') {
        snippetTabStops.current = [];
    }

    // --- ENTER ---
    if (e.key === 'Enter') {
        e.preventDefault();
        const textBefore = value.substring(0, start);
        const lines = textBefore.split('\n');
        const lastLine = lines[lines.length - 1] || '';
        const indentMatch = lastLine.match(/^\s*/);
        const indent = indentMatch ? indentMatch[0] : '';
        
        let insertText = '\n' + indent;
        const matrixEnv = getEnclosingMatrixEnvironment(value, start);
        if (matrixEnv) {
            const trimmedLine = lastLine.trim();
            const shouldAddBackslash = 
                trimmedLine.length > 0 && 
                !trimmedLine.startsWith('\\begin') && 
                !trimmedLine.startsWith('\\end') && 
                !trimmedLine.endsWith('\\\\') && 
                !trimmedLine.endsWith('\\');

            if (shouldAddBackslash) {
                 insertText = ' \\\\\n' + indent;
            }
        }
        
        const newValue = value.substring(0, start) + insertText + value.substring(end);
        const newCursor = start + insertText.length;
        
        updateText(newValue, newCursor, start, insertText.length);
        return;
    }

    // --- WORD DELETE ---
    if (e.key === 'Backspace' && (e.ctrlKey || e.altKey || e.metaKey)) {
        e.preventDefault();
        if (start !== end) {
            const newValue = value.substring(0, start) + value.substring(end);
            const diff = -(end - start);
            updateText(newValue, start, start, diff);
            return;
        }
        const textBefore = value.substring(0, start);
        if (textBefore.length === 0) return;
        const match = textBefore.match(/(\s+|\w+|[^\w\s]+)$/);
        let deleteAmount = 1;
        if (match) deleteAmount = match[0].length;
        const newValue = value.substring(0, start - deleteAmount) + value.substring(end);
        const newCursor = start - deleteAmount;
        const diff = -deleteAmount;
        
        updateText(newValue, newCursor, start - deleteAmount, diff);
        return;
    }

    // --- AUTO-PAIRING ---
    const isModifier = e.ctrlKey || e.altKey || e.metaKey;
    const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']', '"': '"', "'": "'", '$': '$' };
    
    if (!isModifier && pairs[e.key]) {
        e.preventDefault();
        const open = e.key;
        const close = pairs[open];
        
        if (start !== end) {
            const selection = value.substring(start, end);
            const newValue = value.substring(0, start) + open + selection + close + value.substring(end);
            const newCursor = start + 1 + selection.length;
            const diff = 2; // Added 2 chars surrounding
            
            updateText(newValue, newCursor, start, diff);
        } else {
            const newValue = value.substring(0, start) + open + close + value.substring(end);
            const newCursor = start + 1;
            const diff = 2;
            
            updateText(newValue, newCursor, start, diff);
        }
        return;
    }
    
    // --- OVERTYPE ---
    if (start === end && !isModifier) {
        const char = e.key;
        const nextChar = value[start];
        const closingDelimiters = [')', ']', '}', '"', "'", '$'];
        if (closingDelimiters.includes(char) && nextChar === char) {
             e.preventDefault();
             textarea.setSelectionRange(start + 1, start + 1);
             return;
        }
    }
    
    // --- BACKSPACE PAIR ---
    if (e.key === 'Backspace' && start === end && start > 0 && !isModifier) {
        const prev = value[start - 1];
        const next = value[start];
        const pairsRev: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '$': '$' };
        if (pairsRev[prev] === next) {
            e.preventDefault();
            const newValue = value.substring(0, start - 1) + value.substring(start + 1);
            const newCursor = start - 1;
            const diff = -2;
            
            updateText(newValue, newCursor, start - 1, diff);
            return;
        }
    }
    
    // --- VISUAL MACROS (Surround Selection) ---
    if (start !== end && !isModifier && e.key.length === 1) {
        const key = e.key;
        const visualMacro = macros.find(m => 
            m.trigger === key && 
            typeof m.replacement === 'string' && 
            m.replacement.includes('${VISUAL}')
        );
        
        if (visualMacro) {
            e.preventDefault();
            const selection = value.substring(start, end);
            const { text: replacementText, selection: newSel, tabStops } = processReplacement(visualMacro, [], selection);
            
            const newValue = value.substring(0, start) + replacementText + value.substring(end);
            const diff = newValue.length - value.length;
            
            const insertionStart = start;
            
            const absoluteSelection = {
                start: insertionStart + newSel.start,
                end: insertionStart + newSel.end
            };
            const absoluteTabStops = tabStops.map(ts => ({
                start: insertionStart + ts.start,
                end: insertionStart + ts.end
            }));

            updateText(newValue, absoluteSelection.end, start, diff, true);
            setPendingSelection(absoluteSelection.start, absoluteSelection.end);
            snippetTabStops.current = absoluteTabStops;
            return;
        }
    }
  };

  return (
    <div className={`w-full h-full rounded-none md:rounded-lg overflow-hidden border border-slate-300 dark:border-[#333] focus-within:ring-1 focus-within:ring-indigo-500 transition-all shadow-sm relative ${className}`}>
        <textarea
            ref={textareaRef}
            className="w-full h-full resize-none p-4 font-mono text-sm sm:text-base focus:outline-none bg-white dark:bg-[#1e1e1e] text-slate-900 dark:text-[#d4d4d4] selection:bg-[#add6ff] dark:selection:bg-[#264f78]"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            style={{
                fontFamily: "'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace",
                lineHeight: '1.6',
                tabSize: 4
            }}
        />
    </div>
  );
};
